import { beforeEach, expect, it, vi } from "vitest";
import { fallbackDigestBrief } from "../../ai-summary";
import { DIGEST_BRIEF_PROMPT_VERSION } from "../../digest-brief-job";
import type { PipelineStageRun } from "../types";
import { runAiBriefStage } from "./ai-brief";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("../../supabase", () => ({ createSupabaseAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("../../ai-summary", async importOriginal => ({ ...await importOriginal<typeof import("../../ai-summary")>(), generateDigestBriefWithNvidia: mocks.generate }));

const input = { articles: [], interestProfile: { feedTargets: {}, preferredKeywords: [] }, omitted: { insufficientEvidence: 0, overLimit: 0 }, promptVersion: DIGEST_BRIEF_PROMPT_VERSION, version: 1 };
const previousReport = { valid: false, hardErrors: ["sections.0.paragraphs.0.articleIndexes: out of range"], warnings: [] };
const context = () => ({ digestRunId: "run", deadlineMs: Date.now() + 100_000, stage: { lease_token: "lease" } as PipelineStageRun });

beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), update: vi.fn() };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.single.mockResolvedValue({ data: { input_payload: input, status: "retry_wait", validation_report: previousReport }, error: null });
  mocks.from.mockReturnValue(query);
  mocks.rpc.mockImplementation(async name => ({ data: name === "start_digest_brief_attempt" ? { generation_attempt_count: 2 } : true, error: null }));
  mocks.generate.mockResolvedValue({ brief: fallbackDigestBrief([]), model: "test", status: "retryable_failure", errorCode: "invalid_output_or_upstream_error", validationReport: previousReport });
});

it("persists rejection and passes repair instructions with one generation per worker run", async () => {
  const result = await runAiBriefStage(context());
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  expect(mocks.generate.mock.calls[0][0].repairInstructions).toContain("articleIndexes: out of range");
  expect(mocks.rpc).toHaveBeenCalledWith("save_digest_brief_validation", expect.objectContaining({ p_lease_token: "lease", p_attempt: 2, p_report: expect.objectContaining(previousReport) }));
  expect(mocks.rpc.mock.calls.some(([name]) => name === "save_digest_brief_candidate")).toBe(false);
  expect(result.complete).toBe(false);
  expect(result.aiBrief).toBeUndefined();
});

it("does not publish a candidate when its validation report cannot be persisted", async () => {
  mocks.generate.mockResolvedValue({ brief: fallbackDigestBrief([]), model: "test", status: "generated", errorCode: null, validationReport: { valid: true, hardErrors: [], warnings: ["short lead"] } });
  mocks.rpc.mockImplementation(async name => ({ data: name === "start_digest_brief_attempt" ? { generation_attempt_count: 2 } : false, error: null }));
  await expect(runAiBriefStage(context())).rejects.toThrow("Validation report could not be saved");
  expect(mocks.rpc.mock.calls.some(([name]) => name === "save_digest_brief_candidate")).toBe(false);
});

it("accepts editorial warnings after persisting the report", async () => {
  mocks.generate.mockResolvedValue({ brief: fallbackDigestBrief([]), model: "test", status: "generated", errorCode: null, validationReport: { valid: true, hardErrors: [], warnings: ["short lead"] } });
  const result = await runAiBriefStage(context());
  expect(result.aiBrief?.kind).toBe("ai");
  expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["start_digest_brief_attempt", "save_digest_brief_validation", "save_digest_brief_candidate"]);
});
