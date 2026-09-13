import { describe, expect, it } from "vitest";

import { fallbackDigestBrief } from "./ai-summary";
import { buildBriefInput, materializeBrief } from "./digest-brief-job";

const article = (index: number, status: string = "full_text") => ({
  category: "business", evidence: {
    fullTextSourceCount: status === "full_text" ? 1 : 0,
    independentSourceCount: status === "corroborated_summary" ? 2 : 1,
    status,
  }, importanceScore: 90, index,
  newsItemId: `news-${index}`, publishedAt: null, source: `Source ${index}`,
  sourceCount: 1, storyClusterId: `cluster-${index}`, summary: `Summary ${index}`,
  title: `Title ${index}`, whyInteresting: null,
});

describe("frozen digest brief input", () => {
  it("is canonical, bounded and keeps stable references", () => {
    const first = buildBriefInput({ articles: Array.from({ length: 12 }, (_, index) => article(index)), interestProfile: { feedTargets: { business: 4 }, preferredKeywords: ["markets"] }, omitted: { insufficientEvidence: 0, overLimit: 0 } });
    const second = buildBriefInput({ articles: Array.from({ length: 12 }, (_, index) => article(index)), interestProfile: { preferredKeywords: ["markets"], feedTargets: { business: 4 } }, omitted: { insufficientEvidence: 0, overLimit: 0 } });
    expect(first.hash).toBe(second.hash);
    expect(first.payload.articles).toHaveLength(10);
    expect(first.payload.omitted.overLimit).toBe(2);
    const rendered = materializeBrief(fallbackDigestBrief(first.payload.articles), first.payload);
    expect(rendered.highlights[0]).toMatchObject({ newsItemId: "news-0", title: "Title 0" });
    expect(rendered.sections[0]?.paragraphs[0]?.support).toMatchObject({
      fullTextSourceCount: 1,
      independentSourceCount: 1,
      status: "full_text",
    });
    expect(rendered.coverageNote).toContain("2 dalszych materiałów");
  });

  it("does not admit limited evidence into AI input", () => {
    const frozen = buildBriefInput({ articles: [article(0, "limited")], interestProfile: { feedTargets: {}, preferredKeywords: [] }, omitted: { insufficientEvidence: 0, overLimit: 0 } });
    expect(frozen.payload.articles).toEqual([]);
    expect(frozen.payload.omitted.insufficientEvidence).toBe(1);
  });

  it("does not admit unknown evidence into AI input", () => {
    const frozen = buildBriefInput({
      articles: [{ ...article(0), evidence: {} }],
      interestProfile: { feedTargets: {}, preferredKeywords: [] },
      omitted: { insufficientEvidence: 0, overLimit: 0 },
    });

    expect(frozen.payload.articles).toEqual([]);
    expect(frozen.payload.omitted.insufficientEvidence).toBe(1);
  });
});

it("selects independently of input order and protects the most important story", () => {
  const articles = Array.from({ length: 14 }, (_, i) => ({ ...article(i), importanceScore: i === 13 ? 100 : 80, category: i === 12 ? "security" : "business" }));
  const freeze = (items: typeof articles) => buildBriefInput({ articles: items, interestProfile: { feedTargets: {}, preferredKeywords: [] }, omitted: { insufficientEvidence: 0, overLimit: 0 } });
  expect(freeze(articles).hash).toBe(freeze([...articles].reverse()).hash);
  expect(freeze(articles).payload.articles[0].newsItemId).toBe("news-13");
  expect(freeze(articles).payload.articles.some(a => a.category === "security")).toBe(true);
});
it("counts a repeated publisher once across referenced stories", () => {
  const frozen = buildBriefInput({ articles: [article(0), article(1)].map(a => ({ ...a, evidence: { status: "corroborated_summary", sourceNames: ["Publisher", " publisher "] } })), interestProfile: { feedTargets: {}, preferredKeywords: [] }, omitted: { insufficientEvidence: 0, overLimit: 0 } });
  const brief = fallbackDigestBrief(frozen.payload.articles);
  brief.sections[0].paragraphs[0].articleIndexes = [0, 1, 0];
  expect(materializeBrief(brief, frozen.payload).sections[0].paragraphs[0].support).toMatchObject({ fullTextSourceCount: 0, independentSourceCount: 1, status: "limited" });
});
