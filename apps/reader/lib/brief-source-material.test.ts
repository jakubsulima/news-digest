import { expect, it } from "vitest";

import { briefArticleIds, briefSourceMaterials, type BriefArticleSourceRow } from "./brief-source-material";

const article = (id: string, source: string, mode: BriefArticleSourceRow["content_mode"]): BriefArticleSourceRow => ({
  id, source, content_mode: mode, canonical_url: `https://example.com/${id}`,
  title: "Acme ogłasza 42 nowe inwestycje", raw_summary: "Krótkie streszczenie Acme.",
  enriched_description: null,
  enriched_text: mode === "readable" ? "Acme ogłasza 42 nowe inwestycje. Firma opublikowała szczegółowy harmonogram. Kolejny etap ruszy w listopadzie." : null,
});

it("selects the canonical article and a second independent publisher", () => {
  const metadata = { canonicalArticleId: "b", articleIds: ["a", "b", "c", "d"] };
  expect(briefArticleIds(metadata)).toEqual(["b", "a", "c", "d"]);
  const articles = new Map([
    ["a", article("a", "Acme News", "readable")],
    ["b", article("b", "Acme News", "readable")],
    ["c", article("c", "Other News", "insufficient_text")],
    ["d", article("d", "Third News", "readable")],
  ]);
  const sources = briefSourceMaterials(metadata, articles);
  expect(sources.map((item) => item.source)).toEqual(["Acme News", "Third News"]);
  expect(sources[0].text).toContain("42 nowe inwestycje");
  expect(sources[1].contentMode).toBe("readable");
});

it("marks summary-only evidence when no readable variant exists", () => {
  const sources = briefSourceMaterials({ canonicalArticleId: "c", articleIds: ["c"] },
    new Map([["c", article("c", "Other News", "insufficient_text")]]));
  expect(sources[0]).toMatchObject({ contentMode: "summary", text: "Krótkie streszczenie Acme." });
});

it("keeps model prices with their paragraph and model name", () => {
  const original = article("pricing", "Publisher", "readable");
  original.title = "Claude Opus 5.5, GPT-6 Luna, and model prices";
  original.enriched_text = [
    "Claude Opus 5.5 and GPT-6 Luna were released today. " + "Background about the launches. ".repeat(15),
    "Other model comparisons and reactions. ".repeat(20),
    "Opus 4.5 and 5 used to cost $5/$25. Opus 5.5 now costs $4/$20 per million tokens.",
    "More commentary on the market. ".repeat(20),
    "Anthropic says Haiku 5.5 is coming soon. Haiku 4.5 is $1/$5 while GPT-6 Luna is $0.10/$0.50.",
  ].join("\n\n");
  const text = briefSourceMaterials({ canonicalArticleId: "pricing" }, new Map([["pricing", original]]))[0].text;
  expect(text).toContain("Opus 5.5 now costs $4/$20");
  expect(text).toContain("Haiku 4.5 is $1/$5");
  expect(text).not.toContain("Opus 5. 5");
  expect(text.length).toBeLessThanOrEqual(1_350);
});

it("prefers available full text when the canonical article has only a feed summary", () => {
  const sources = briefSourceMaterials({ canonicalArticleId: "a", articleIds: ["a", "b", "c"] }, new Map([
    ["a", article("a", "Publisher", "insufficient_text")],
    ["b", article("b", "Publisher", "readable")],
    ["c", article("c", "Other", "insufficient_text")],
  ]));
  expect(sources[0]).toMatchObject({ contentMode: "readable", url: "https://example.com/b" });
  expect(sources[0].text).toContain("harmonogram");
  expect(sources[1].source).toBe("Other");
});

it("does not mistake whitespace-only extraction for full text", () => {
  const empty = { ...article("a", "Publisher", "readable"), enriched_text: "  \n " };
  const sources = briefSourceMaterials({ canonicalArticleId: "a", articleIds: ["a", "b"] }, new Map([
    ["a", empty], ["b", article("b", "Other", "readable")],
  ]));
  expect(sources[0]).toMatchObject({ contentMode: "readable", source: "Other" });
});
