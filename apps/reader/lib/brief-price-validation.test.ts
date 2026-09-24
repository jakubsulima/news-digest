import { expect, it } from "vitest";

import { buildBriefInputV2 } from "./digest-brief-job";
import type { NvidiaDigestBrief } from "./ai-summary";
import { unsupportedModelPriceClaims } from "./brief-price-validation";

const source = "Opus 5.5 now costs $4/$20 per million tokens. Haiku 4.5 is $1/$5 while GPT-6 Luna is $0.10/$0.50.";
const input = buildBriefInputV2({
  articles: [{ category: "AI", evidence: { status: "full_text" }, importanceScore: 90, index: 0,
    newsItemId: "story", publishedAt: null, source: "Publisher", sourceCount: 1,
    storyClusterId: "cluster", summary: "Model prices changed.", title: "Claude Opus 5.5 and GPT-6 Luna",
    whyInteresting: null, sourceMaterials: [{ contentMode: "readable", source: "Publisher", text: source,
      title: "Claude Opus 5.5 and GPT-6 Luna", url: "https://example.com" }] }],
  interestProfile: { feedTargets: {}, preferredKeywords: [] },
  omitted: { insufficientEvidence: 0, overLimit: 0 },
}).payload;

function brief(text: string): NvidiaDigestBrief {
  return { coverageNote: "", highlights: [], readingTimeMinutes: 1, summary: "", summaryArticleIndexes: [], watchlist: [],
    sections: [{ category: "AI", title: "Model prices", paragraphs: [{ articleIndexes: [0], text }] }] };
}

it("rejects a price borrowed from another model in the same source", () => {
  expect(unsupportedModelPriceClaims(brief("Claude Opus 5.5 kosztuje 1 USD/5 USD za milion tokenów."), input))
    .toEqual([expect.stringContaining("attributes price 1/5 to opus 5.5")]);
});

it("allows prices attributed to the right model", () => {
  expect(unsupportedModelPriceClaims(brief("Claude Opus 5.5 kosztuje 4 USD/20 USD, a Haiku 4.5 kosztuje 1 USD/5 USD."), input))
    .toEqual([]);
});

it("rejects a price pair absent from the excerpt and accepts an explicit input/output pair", () => {
  const withoutHaiku = structuredClone(input);
  withoutHaiku.articles[0].sourceMaterials[0].text = "Opus 4.5, 4.6, 4.7, 4.8, and 5 all shared the same price: $5/million tokens for input and $25/million for output. 5.5 is a 20% reduction—$4/million and $20/million.";
  expect(unsupportedModelPriceClaims(brief("Claude Opus 5.5 kosztuje 1 USD/5 USD."), withoutHaiku))
    .toEqual([expect.stringContaining("source does not state that price pair")]);
  expect(unsupportedModelPriceClaims(brief("Claude Opus 5.5 kosztuje 4 USD/20 USD."), withoutHaiku)).toEqual([]);
  expect(unsupportedModelPriceClaims(brief("Claude Opus 5.5 kosztuje 4 USD za milion tokenów wejściowych i 20 USD za milion tokenów wyjściowych."), withoutHaiku)).toEqual([]);
});
