import { expect, it } from "vitest";

import type { NvidiaDigestBrief } from "./ai-summary";
import { unsupportedNumericClaims } from "./brief-grounding-validation";
import { buildBriefInputV2 } from "./digest-brief-job";

const input = buildBriefInputV2({
  articles: [{ category: "business", evidence: { status: "full_text" }, importanceScore: 90, index: 0,
    newsItemId: "story", publishedAt: null, source: "Publisher", sourceCount: 1,
    storyClusterId: "cluster", summary: "Acme announced 12 new contracts.", title: "Acme expansion",
    whyInteresting: null, sourceMaterials: [{ contentMode: "readable", source: "Publisher",
      text: "Acme announced 12 new contracts worth $8.2 million in 2026.", title: "Acme expansion", url: "https://example.com" }] }],
  interestProfile: { feedTargets: {}, preferredKeywords: [] },
  omitted: { insufficientEvidence: 0, overLimit: 0 },
}).payload;

function brief(text: string): NvidiaDigestBrief {
  return { coverageNote: "", highlights: [], readingTimeMinutes: 1, summary: "", summaryArticleIndexes: [], watchlist: [],
    sections: [{ category: "business", title: "Acme", paragraphs: [{ articleIndexes: [0], text }] }] };
}

it("rejects a new quantity that is absent from the cited story", () => {
  expect(unsupportedNumericClaims(brief("Acme podpisała 13 nowych umów."), input))
    .toEqual([expect.stringContaining("numbers absent from its cited sources: 13")]);
});

it("accepts supported counts and comma-formatted decimals", () => {
  expect(unsupportedNumericClaims(brief("Acme podpisała 12 umów o wartości 8,2 mln dolarów w 2026 roku."), input))
    .toEqual([]);
});

it("accepts a decimal when an upstream extractor inserted a space after its separator", () => {
  const extracted = structuredClone(input);
  extracted.articles[0].sourceMaterials[0].text = "Acme announced 12 contracts worth $8. 2 million.";
  expect(unsupportedNumericClaims(brief("Acme podpisała 12 umów o wartości 8,2 mln dolarów."), extracted))
    .toEqual([]);
});

it("does not treat a feed summary as confirmation when the full article is available", () => {
  const conflicting = structuredClone(input);
  conflicting.articles[0].summary = "Acme announced 13 new contracts.";
  expect(unsupportedNumericClaims(brief("Acme podpisała 13 nowych umów."), conflicting))
    .toEqual([expect.stringContaining("numbers absent from its cited sources: 13")]);
});

it("reads figures with attached units and a decade paraphrase", () => {
  const article = structuredClone(input);
  article.articles[0].sourceMaterials[0].text = "The deficit is £21bn and imports were 19.1bn kg. The site seeks 90MW, its owner plans a $35bn listing, and launch may slip into the mid-2030s.";
  expect(unsupportedNumericClaims(brief("Deficyt wyniósł 21 mld funtów, import 19,1 mld kg, a projekt wymaga 90 MW. Firma planuje ofertę za 35 mld dolarów i uruchomienie w latach 30."), article))
    .toEqual([]);
});
