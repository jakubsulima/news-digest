import "server-only";

import { runStageForRun } from "./digest-builder/stage-registry";
import type { DigestRun, PipelineStageRun } from "./digest-builder/types";
import { errorMessage } from "./digest-builder/utils";
import { digestPipelineVersion, getDigestRunById, pruneCompletedDigestRuns, sortDigestStages } from "./digest-runs";
import { createSupabaseAdminClient } from "./supabase";

const RUNNING_STAGE_STALE_MS = 150_000;
const DEFAULT_ADVANCE_UNTIL_IDLE_BUDGET_MS = 90_000;

type AdvanceDigestRunUntilIdleOptions = {
  budgetMs?: number;
  scheduleContinuation?: () => Promise<void>;
};

type AdvanceDigestRunResult = {
  runId: string;
  status: DigestRun["status"];
  advancedStage: PipelineStageRun["stage_name"] | null;
  message: string;
};

async function advanceV2(run: Awaited<ReturnType<typeof getDigestRunById>> & {}) : Promise<AdvanceDigestRunResult> {
  if (!run) throw new Error("Digest run not found.");
  const supabase = createSupabaseAdminClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: PipelineStageRun | boolean | null; error: { message: string } | null }>;
  const claim = await rpc("claim_next_digest_stage", { p_lease_seconds: 150, p_run_id: run.id });
  if (claim.error) throw claim.error;
  const stage = claim.data && typeof claim.data === "object" && "id" in claim.data && claim.data.id
    ? claim.data as PipelineStageRun
    : null;
  if (!stage) return { runId: run.id, status: "running", advancedStage: null, message: "No v2 stage is ready." };
  const leaseToken = stage.lease_token;
  if (!leaseToken) throw new Error("Claim returned no lease token.");
  try {
    const result = await runStageForRun(stage, run.id, Date.now() + 100_000);
    if (result.aiBrief) {
      const commit = await rpc("commit_digest_brief", { p_kind: result.aiBrief.kind, p_lease_token: leaseToken, p_reason: result.aiBrief.reason, p_run_id: run.id, p_summary: result.aiBrief.brief });
      if (commit.error || commit.data !== true) throw commit.error || new Error("AI result commit lost its lease.");
    } else {
      const finish = await rpc("finish_digest_stage", { p_error: null, p_lease_token: leaseToken, p_metrics: result.metrics ?? {}, p_next_attempt_at: result.nextAttemptAt ?? null, p_stage_id: stage.id, p_status: result.complete === false ? "queued" : "succeeded" });
      if (finish.error || finish.data !== true) throw finish.error || new Error("Stage completion lost its lease.");
    }
    if (stage.stage_name === "finalization") {
      return { runId: run.id, status: "succeeded", advancedStage: stage.stage_name, message: "Run finalized." };
    }
    return { runId: run.id, status: "running", advancedStage: stage.stage_name, message: result.message || `${stage.stage_name} succeeded.` };
  } catch (error) {
    const message = `${stage.stage_name}: ${errorMessage(error)}`;
    // AI work has durable input/candidates. Give storage failures a bounded
    // recovery window without discarding a validated provider response.
    const retry = stage.stage_name === "ai_brief" && stage.attempt_count < 6;
    const finish = await rpc("finish_digest_stage", { p_error: message, p_lease_token: leaseToken,
      p_metrics: { infrastructureRetry: true }, p_next_attempt_at: retry ? new Date(Date.now() + 30_000).toISOString() : null,
      p_stage_id: stage.id, p_status: retry ? "queued" : "failed" });
    // A lost lease or uncertain commit belongs to the current worker/watchdog.
    // Never mark the run failed unless our fenced write actually succeeded.
    if (finish.error || finish.data !== true || retry) {
      return { runId: run.id, status: "running", advancedStage: null, message: `Recovery pending: ${message}` };
    }
    return { runId: run.id, status: "failed", advancedStage: stage.stage_name, message };
  }
}

function runningStageIsStale(stage: PipelineStageRun, nowMs = Date.now()) {
  if (!stage.started_at) {
    return true;
  }

  const startedAtMs = Date.parse(stage.started_at);

  return Number.isNaN(startedAtMs) || nowMs - startedAtMs > RUNNING_STAGE_STALE_MS;
}

function queuedStage(stages: PipelineStageRun[]) {
  const sortedStages = sortDigestStages(stages);

  return sortedStages.find((stage) => stage.status === "queued") || null;
}

export async function advanceDigestRun(digestRunId: string): Promise<AdvanceDigestRunResult> {
  const run = await getDigestRunById(digestRunId);

  if (!run) {
    throw new Error("Digest run not found.");
  }

  if (run.status !== "queued" && run.status !== "running") {
    return {
      runId: run.id,
      status: run.status,
      advancedStage: null,
      message: `Run is already ${run.status}.`,
    };
  }

  if (digestPipelineVersion(run.metadata) === 2) return advanceV2(run);

  const supabase = createSupabaseAdminClient();
  const runningStage = sortDigestStages(run.stages).find((stage) => stage.status === "running") || null;
  let stage: PipelineStageRun | null = null;

  if (runningStage && !runningStageIsStale(runningStage)) {
    return {
      runId: run.id,
      status: "running",
      advancedStage: null,
      message: `${runningStage.stage_name} is already running.`,
    };
  }

  if (runningStage) {
    const { data, error } = await supabase
      .from("pipeline_stage_runs")
      .update({
        error_message: null,
        finished_at: null,
        started_at: null,
        status: "queued",
      })
      .eq("id", runningStage.id)
      .eq("status", "running")
      .select("*")
      .maybeSingle();

    if (error) {
      throw error;
    }

    stage = data;
  }

  stage = stage || queuedStage(run.stages);

  if (!stage) {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("digest_runs")
      .update({
        finished_at: now,
        status: "succeeded",
      })
      .eq("id", run.id)
      .in("status", ["queued", "running"]);

    if (error) {
      throw error;
    }

    return {
      runId: run.id,
      status: "succeeded",
      advancedStage: null,
      message: "Run finalized.",
    };
  }

  const now = new Date().toISOString();
  const { error: runError } = await supabase
    .from("digest_runs")
    .update({
      started_at: run.started_at ?? now,
      status: "running",
    })
    .eq("id", run.id)
    .in("status", ["queued", "running"]);

  if (runError) {
    throw runError;
  }

  let claimedStage: PipelineStageRun | null = stage;

  if (stage.status === "queued") {
    const { data, error: claimError } = await supabase
      .from("pipeline_stage_runs")
      .update({
        attempt_count: stage.attempt_count + 1,
        error_message: null,
        started_at: now,
        status: "running",
      })
      .eq("id", stage.id)
      .eq("status", "queued")
      .select("*")
      .maybeSingle();

    if (claimError) {
      throw claimError;
    }

    claimedStage = data;

    if (!claimedStage) {
      return {
        runId: run.id,
        status: "running",
        advancedStage: null,
        message: "No queued stage was claimed.",
      };
    }
  }

  try {
    const result = await runStageForRun(claimedStage, run.id);
    const finishedAt = new Date().toISOString();
    const stageComplete = result.complete !== false;
    const { error: stageError } = await supabase
      .from("pipeline_stage_runs")
      .update({
        finished_at: stageComplete ? finishedAt : null,
        metrics: result.metrics ?? {},
        status: stageComplete ? "succeeded" : "queued",
      })
      .eq("id", claimedStage.id)
      .eq("status", "running");

    if (stageError) {
      throw stageError;
    }

    if (!stageComplete) {
      return {
        runId: run.id,
        status: "running",
        advancedStage: claimedStage.stage_name,
        message: result.message || `${claimedStage.stage_name} is still running.`,
      };
    }

    if (claimedStage.stage_name === "finalization") {
      const { error: digestRunError } = await supabase
        .from("digest_runs")
        .update({
          error_message: null,
          finished_at: finishedAt,
          status: "succeeded",
        })
        .eq("id", run.id)
        .eq("status", "running");

      if (digestRunError) {
        throw digestRunError;
      }

      await pruneCompletedDigestRuns();

      return {
        runId: run.id,
        status: "succeeded",
        advancedStage: claimedStage.stage_name,
        message: "Run finalized.",
      };
    }

    return {
      runId: run.id,
      status: "running",
      advancedStage: claimedStage.stage_name,
      message: result.message || `${claimedStage.stage_name} succeeded.`,
    };
  } catch (error) {
    const message = `${claimedStage.stage_name}: ${errorMessage(error)}`;
    const finishedAt = new Date().toISOString();
    const [{ error: stageError }, { error: digestRunError }] = await Promise.all([
      supabase
        .from("pipeline_stage_runs")
        .update({
          error_message: message,
          finished_at: finishedAt,
          status: "failed",
        })
        .eq("id", claimedStage.id)
        .eq("status", "running"),
      supabase
        .from("digest_runs")
        .update({
          error_message: message,
          finished_at: finishedAt,
          status: "failed",
        })
        .eq("id", run.id)
        .eq("status", "running"),
    ]);

    if (stageError) {
      throw stageError;
    }
    if (digestRunError) {
      throw digestRunError;
    }

    return {
      runId: run.id,
      status: "failed",
      advancedStage: claimedStage.stage_name,
      message,
    };
  }
}

export async function advanceDigestRunUntilIdle(
  digestRunId: string,
  options: AdvanceDigestRunUntilIdleOptions = {},
): Promise<AdvanceDigestRunResult> {
  const { budgetMs = DEFAULT_ADVANCE_UNTIL_IDLE_BUDGET_MS, scheduleContinuation } = options;
  const startedAtMs = Date.now();

  while (Date.now() - startedAtMs < budgetMs) {
    const result = await advanceDigestRun(digestRunId);

    if (result.status !== "queued" && result.status !== "running") {
      return result;
    }

    if (!result.advancedStage) {
      return result;
    }

    // Reader publication can spend the full AI budget generating and correcting
    // a digest. Start it in a fresh invocation and yield after each attempt so a
    // queued retry never consumes the same serverless function budget.
    if (result.advancedStage === "editorial_scoring" || result.advancedStage === "reader_publication" || result.advancedStage === "ai_brief") {
      await scheduleContinuation?.();
      return result;
    }
  }

  await scheduleContinuation?.();

  return {
    runId: digestRunId,
    status: "running",
    advancedStage: null,
    message: "Digest run advancement paused at the background execution budget.",
  };
}
