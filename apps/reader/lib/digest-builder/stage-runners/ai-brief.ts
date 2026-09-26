import "server-only";

import { fallbackDigestBrief, generateDigestBriefWithNvidia } from "../../ai-summary";
import { materializeBrief, type BriefInput } from "../../digest-brief-job";
import { generateDigestBriefWithLuna } from "../../openai-brief";
import { createSupabaseAdminClient } from "../../supabase";
import type { StageRunner } from "../types";

const MAX_GENERATIONS = 3;

export const runAiBriefStage: StageRunner = async ({ digestRunId, stage, deadlineMs }) => {
  const supabase = createSupabaseAdminClient();
  const { data: job, error } = await supabase.from("digest_brief_jobs").select("*").eq("digest_run_id", digestRunId).single();
  if (error) throw error;
  const input = job.input_payload as unknown as BriefInput;
  const leaseToken = stage.lease_token;
  if (!leaseToken) throw new Error("AI stage has no lease token.");
  const fallback = materializeBrief(fallbackDigestBrief(input.articles), input);

  if (job.status === "skipped" || job.status === "fallback") {
    return { aiBrief: { brief: fallback, kind: "fallback", reason: job.reason || "skipped" } };
  }
  if (job.candidate_payload) {
    const report = job.validation_report;
    if (!report || typeof report !== "object" || Array.isArray(report) || report.valid !== true) {
      return { aiBrief: { brief: fallback, kind: "fallback", reason: "unvalidated_candidate" } };
    }
    return { aiBrief: { brief: job.candidate_payload, kind: "ai", reason: null } };
  }
  if (job.generation_attempt_count >= MAX_GENERATIONS) {
    return { aiBrief: { brief: fallback, kind: "fallback", reason: job.last_error_code || "generation_attempts_exhausted" } };
  }
  const remainingMs = deadlineMs - Date.now() - 20_000;
  if (remainingMs < 10_000) return { complete: false, message: "AI briefing yielded before generation: insufficient deadline budget." };

  const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: typeof job | null; error: { message: string } | null }>;
  const started = await rpc("start_digest_brief_attempt", { p_run_id: digestRunId, p_lease_token: leaseToken });
  if (started.error || !started.data) throw started.error || new Error("AI job could not start.");
  const attempt = started.data.generation_attempt_count;
  const previousReport = job.validation_report;
  const repairInstructions = previousReport && typeof previousReport === "object" && !Array.isArray(previousReport)
    && Array.isArray(previousReport.hardErrors)
    ? previousReport.hardErrors.filter((error): error is string => typeof error === "string").map(error => error.slice(0, 240)).join("\n")
    : undefined;
  const generation = input.version === 2 && input.provider === "openai"
    ? await generateDigestBriefWithLuna({ input, repairInstructions, attempt, previousErrorCode: job.last_error_code, timeoutMs: Math.min(60_000, remainingMs) })
    : await generateDigestBriefWithNvidia({ articles: input.articles, attempt, repairInstructions: job.validation_report ? JSON.stringify(job.validation_report) : undefined, interestProfile: input.interestProfile, timeoutMs: Math.min(60_000, remainingMs) });

  const report = generation.validationReport ?? { valid: false, hardErrors: [generation.errorCode || "generation_failed"], warnings: [] };
  const providerMetrics = "metrics" in generation && generation.metrics ? generation.metrics : {};
  const savedReport = await rpc("save_digest_brief_validation", { p_run_id: digestRunId, p_lease_token: leaseToken,
    p_attempt: attempt, p_report: { ...report, attempt, model: generation.model, providerMetrics, validatedAt: new Date().toISOString() } });
  if (savedReport.error || !savedReport.data) throw savedReport.error || new Error("Validation report could not be saved.");
  if (generation.status === "generated" && report.valid) {
    const candidate = materializeBrief(generation.brief, input);
    const saved = await rpc("save_digest_brief_candidate", { p_candidate: candidate, p_lease_token: leaseToken, p_model: generation.model, p_run_id: digestRunId });
    if (saved.error || !saved.data) throw saved.error || new Error("AI candidate lease was lost.");
    return { aiBrief: { brief: candidate, kind: "ai", reason: null }, metrics: { generationAttempt: attempt, model: generation.model, ...providerMetrics } };
  }

  if (generation.status === "configuration_error" || generation.status === "terminal_failure" || attempt >= MAX_GENERATIONS) {
    return { aiBrief: { brief: fallback, kind: "fallback", reason: generation.errorCode }, metrics: { generationAttempt: attempt, model: generation.model, ...providerMetrics } };
  }
  const backoffMs = attempt === 1 ? 30_000 + Math.floor(Math.random() * 10_001) : 120_000 + Math.floor(Math.random() * 30_001);
  const delayMs = Math.max(backoffMs, generation.retryAfterMs || 0);
  // finish_digest_stage checkpoints the retry and job state atomically under
  // the lease; a stale worker must never update a new owner's generation.
  return { complete: false, message: `AI briefing retry ${attempt}/${MAX_GENERATIONS} queued.`, nextAttemptAt: new Date(Date.now() + delayMs).toISOString(), metrics: { generationAttempt: attempt, lastErrorCode: generation.errorCode, model: generation.model, ...providerMetrics } };
};
