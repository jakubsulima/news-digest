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
