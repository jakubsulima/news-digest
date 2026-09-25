import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { buildBriefInputV2 } from "./digest-brief-job";
import { generateDigestBriefWithLuna, parseLunaBrief } from "./openai-brief";

const sentence = "Acme ogłosiła nową inwestycję w Warszawie i podała jej dokładny harmonogram oraz planowane etapy realizacji.";
const prose = Array.from({ length: 9 }, () => sentence).join(" ");
const rawBrief = (count: number) => ({
  summary: Array.from({ length: 7 }, () => sentence).join(" "),
  summaryArticleIndexes: [0],
  highlights: [{ articleIndex: 0, whatHappened: sentence, whyItMatters: sentence }],
  sections: Array.from({ length: count }, (_, articleIndex) => ({
    articleIndex, category: "business", kind: articleIndex < 8 ? "full" : "short",
    title: `Historia ${articleIndex}`, text: articleIndex < 8 ? prose : Array.from({ length: 4 }, () => sentence).join(" "),
  })),
  watchlist: [], coverageNote: "Część historii oparto na ograniczonej liczbie źródeł.",
});

const input = buildBriefInputV2({
  articles: Array.from({ length: 20 }, (_, index) => ({
    category: "business", evidence: { status: "full_text" }, importanceScore: 90, index,
    newsItemId: `news-${index}`, publishedAt: null, source: `Source ${index}`,
    sourceCount: 1, storyClusterId: `cluster-${index}`, summary: sentence,
    title: `Title ${index}`, whyInteresting: null,
    sourceMaterials: [{ contentMode: "readable", source: `Source ${index}`, text: prose,
      title: `Title ${index}`, url: `https://example.com/${index}` }],
  })),
  interestProfile: { feedTargets: {}, preferredKeywords: [] },
  omitted: { insufficientEvidence: 0, overLimit: 0 },
}).payload;

beforeEach(() => vi.stubEnv("OPENAI_API_KEY", "test-secret"));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("rejects an omitted story and accepts full coverage of 20", () => {
  expect(parseLunaBrief(rawBrief(19), 20).report.valid).toBe(false);
  const parsed = parseLunaBrief(rawBrief(20), 20);
  expect(parsed.report.valid).toBe(true);
  expect(parsed.brief?.sections).toHaveLength(20);
  expect(parsed.brief?.readingTimeMinutes).toBeGreaterThan(5);
});

it("keeps a complete briefing when lead links and full-section count miss editorial targets", () => {
  const response = rawBrief(20);
  response.summaryArticleIndexes = [1];
  response.sections.slice(4, 8).forEach((section) => { section.kind = "short"; });
  const parsed = parseLunaBrief(response, 20);
  expect(parsed.report.valid).toBe(true);
  expect(parsed.report.warnings).toContain("Some lead references are not repeated in highlights.");
  expect(parsed.report.warnings).toContain("Aim for at least 8 full sections.");
});

it("still rejects a briefing with too few developed sections", () => {
  const response = rawBrief(20);
  response.sections.slice(3, 8).forEach((section) => { section.kind = "short"; });
  expect(parseLunaBrief(response, 20).report.hardErrors).toContain("At least 4 sections must be full.");
});

it("uses Responses structured output, preserves source text and records token usage", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    status: "completed", usage: { input_tokens: 10_000, output_tokens: 4_000, output_tokens_details: { reasoning_tokens: 500 } },
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(rawBrief(20)) }] }],
  }) });
  vi.stubGlobal("fetch", fetchMock);
  const result = await generateDigestBriefWithLuna({ input, timeoutMs: 5_000 });
  const request = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
  expect(request.model).toBe("gpt-6-luna");
  expect(request.text.format.type).toBe("json_schema");
  expect(request.temperature).toBeUndefined();
  expect(request.input).toContain("Source 19");
  expect(result.status).toBe("generated");
  expect(result.metrics).toMatchObject({ inputTokens: 10_000, outputTokens: 4_000, reasoningTokens: 500, estimatedCostUsd: 0.003 });
});

it("uses the frozen model and avoids Luna cost estimates for another model", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    status: "completed", usage: { input_tokens: 10_000, output_tokens: 4_000 },
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(rawBrief(20)) }] }],
  }) });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("DIGEST_BRIEF_OPENAI_MODEL", "gpt-6-luna");
  const result = await generateDigestBriefWithLuna({ input: { ...input, model: "gpt-future" }, timeoutMs: 5_000 });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("gpt-future");
  expect(result).toMatchObject({ model: "gpt-future", status: "generated", metrics: { estimatedCostUsd: null } });
});

it("rejects a generated section that assigns Haiku's price to Opus", async () => {
  const pricedInput = structuredClone(input);
  pricedInput.articles[0].sourceMaterials[0].text = "Opus 5.5 costs $4/$20. Haiku 4.5 costs $1/$5.";
  const response = rawBrief(20);
  response.sections[0].text += " Claude Opus 5.5 kosztuje 1 USD/5 USD za milion tokenów.";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(response) }] }],
  }) }));
  const result = await generateDigestBriefWithLuna({ input: pricedInput, timeoutMs: 5_000 });
  expect(result.status).toBe("retryable_failure");
  expect(result.validationReport?.hardErrors).toContainEqual(expect.stringContaining("attributes price 1/5 to opus 5.5"));
});

it("rejects an unsupported quantity before saving the candidate", async () => {
  const response = rawBrief(20);
  response.sections[0].text += " Acme podpisała 13 nowych umów.";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(response) }] }],
  }) }));
  const result = await generateDigestBriefWithLuna({ input, timeoutMs: 5_000 });
  expect(result.status).toBe("retryable_failure");
  expect(result.validationReport?.hardErrors).toContainEqual(expect.stringContaining("numbers absent from its cited sources: 13"));
});

it("fails without a key without sending article text", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  expect((await generateDigestBriefWithLuna({ input, timeoutMs: 5_000 })).status).toBe("configuration_error");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("treats billing errors as configuration failures", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 402 }));
  const result = await generateDigestBriefWithLuna({ input, timeoutMs: 5_000 });
  expect(result).toMatchObject({ status: "configuration_error", errorCode: "openai_http_402" });
});

it("stops retrying after a model refusal", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "Cannot comply" }] }],
  }) }));
  const result = await generateDigestBriefWithLuna({ input, timeoutMs: 5_000 });
  expect(result).toMatchObject({ status: "terminal_failure", errorCode: "openai_refusal" });
});
