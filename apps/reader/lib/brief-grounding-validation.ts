import type { NvidiaDigestBrief } from "./ai-summary";
import type { BriefInputV2 } from "./digest-brief-job";
import { unsupportedModelPriceClaims } from "./brief-price-validation";

function numericValues(text: string, source = false) {
  // Be conservative for old frozen inputs without a language tag: recognize
  // comma grouping only in clearly English prose, never in Polish output.
  const englishMarkers = new Set(text.toLowerCase().match(/\b(?:the|of|to|and|with|for|from|than)\b/gu) || []);
  const englishGrouping = source && englishMarkers.size >= 3 && !/\b(?:oraz|jest|wynosi|który|które|się)\b/iu.test(text);
  if (englishGrouping) {
    text = text.replace(/(?<![\d.,])\b\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])/gu, value => value.replace(/,/gu, ""));
  }
  if (source) {
    const dozens: Record<string, number> = { "half a": 6, a: 12, one: 12, two: 24, three: 36 };
    text = text.replace(/\b(half a|a|one|two|three) dozen\b/giu, (_, count: string) => String(dozens[count.toLowerCase()]));
  }
  const times = new Set<string>();
  // Compare whole clock times, not their hour/minute fragments. A translation
  // from 10:00 p.m. to 22:00 must not authorize an unrelated quantity of 22.
  const withoutTimes = text.replace(/\b(\d{1,2})(?::([0-5]\d)\s*(a\.?m\.?|p\.?m\.?)?|(\s*(?:a\.?m\.?|p\.?m\.?)))(?!\w)/giu,
    (match, hourText: string, minuteText: string | undefined, marker: string | undefined, hourMarker: string | undefined) => {
      let hour = Number(hourText);
      const period = (marker || hourMarker || "").replace(/[.\s]/gu, "").toLowerCase();
      if (period ? hour < 1 || hour > 12 : hour > 23) return match;
      if (period) hour = hour % 12 + (period === "pm" ? 12 : 0);
      times.add(`time:${String(hour).padStart(2, "0")}:${minuteText || "00"}`);
      return " ";
    });
  // Some upstream extractors insert a space inside decimal numbers and model versions.
  const normalized = withoutTimes
    .replace(/(?<![\d.,])\b\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?!\d)/gu, (value) => value.replace(/\s/gu, ""))
    .replace(/\b(\d{1,3})\.\s+(\d{1,3})\b/gu, "$1.$2")
    .replace(/(\d+(?:[.,]\d+)?)\s*(thousand|million|billion|trillion|tys|mln|mld|bn|mn)\b\.?/giu,
      (_, coefficient: string, unit: string) => {
        const scale: Record<string, number> = { thousand: 1e3, tys: 1e3, million: 1e6, mln: 1e6, mn: 1e6,
          billion: 1e9, mld: 1e9, bn: 1e9, trillion: 1e12 };
        return String(Number((Number(coefficient.replace(",", ".")) * scale[unit.toLowerCase()]).toPrecision(15)));
      });
  const values = new Set([...times, ...[...normalized.matchAll(/\d+(?:[.,]\d+)?/gu)]
    .map((match) => String(Number(match[0].replace(",", "."))))]);
  for (const match of normalized.matchAll(/\b(?:19|20)(\d)0s\b/giu)) values.add(String(Number(match[1]) * 10));
  return values;
}

export function unsupportedNumericClaims(brief: NvidiaDigestBrief, input: BriefInputV2) {
  const errors: string[] = [];
  const check = (text: string, articleIndexes: number[], label: string) => {
    const articles = [...new Set(articleIndexes)].flatMap((index) => input.articles[index] ? [input.articles[index]] : []);
    const sourceTexts = articles.flatMap((article) => {
      const readable = article.sourceMaterials.filter((material) => material.contentMode === "readable");
      const materials = readable.length ? readable : article.sourceMaterials;
      const storyContext = [article.title, ...(readable.length ? [] : [article.summary])].join("\n");
      return materials.length ? materials.map((material) => `${storyContext}\n${material.title}\n${material.text}`) : [storyContext];
    });
    const sourceValues = new Set(sourceTexts.flatMap(text => [...numericValues(text, true)]));
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
