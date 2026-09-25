import type { NvidiaDigestBrief } from "./ai-summary";
import type { BriefInputV2 } from "./digest-brief-job";
import { unsupportedModelPriceClaims } from "./brief-price-validation";

function numericValues(text: string) {
  // Some upstream extractors insert a space inside decimal numbers and model versions.
  const normalized = text.replace(/\b(\d{1,3})[.,]\s+(\d{1,3})\b/gu, "$1.$2");
  const values = new Set([...normalized.matchAll(/\d+(?:[.,]\d+)?/gu)]
    .map((match) => String(Number(match[0].replace(",", ".")))));
  for (const match of normalized.matchAll(/\b(?:19|20)(\d)0s\b/giu)) values.add(String(Number(match[1]) * 10));
  return values;
}

export function unsupportedNumericClaims(brief: NvidiaDigestBrief, input: BriefInputV2) {
  const errors: string[] = [];
  const check = (text: string, articleIndexes: number[], label: string) => {
    const articles = [...new Set(articleIndexes)].flatMap((index) => input.articles[index] ? [input.articles[index]] : []);
    const sourceText = articles.flatMap((article) => {
      const readable = article.sourceMaterials.filter((material) => material.contentMode === "readable");
      const materials = readable.length ? readable : article.sourceMaterials;
      return [article.title, ...(readable.length ? [] : [article.summary]),
        ...materials.flatMap((material) => [material.title, material.text])];
    }).join(" ");
    const sourceValues = numericValues(sourceText);
    const missing = [...numericValues(text)].filter((value) => !sourceValues.has(value));
    if (missing.length) errors.push(`${label} contains numbers absent from its cited sources: ${missing.slice(0, 8).join(", ")}.`);
  };
  check(brief.summary, brief.summaryArticleIndexes, "Lead");
  brief.highlights.forEach((highlight) => check(`${highlight.whatHappened} ${highlight.whyItMatters}`, [highlight.articleIndex], `Highlight ${highlight.articleIndex}`));
  brief.sections.forEach((section) => section.paragraphs.forEach((paragraph) =>
    check(paragraph.text, paragraph.articleIndexes, `Section ${paragraph.articleIndexes.join(",")}`)));
  brief.watchlist.forEach((item) => check(`${item.signal} ${item.why}`, item.articleIndexes, "Watchlist"));
  return errors.slice(0, 12);
}

export function validateBriefGrounding(brief: NvidiaDigestBrief, input: BriefInputV2) {
  return [...unsupportedNumericClaims(brief, input), ...unsupportedModelPriceClaims(brief, input)].slice(0, 12);
}
