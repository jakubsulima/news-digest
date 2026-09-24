import type { Database, Json } from "./database.types";
import type { BriefSourceMaterial } from "./digest-brief-job";
import { plainTextFromHtml } from "./text";

export type BriefArticleSourceRow = Pick<Database["public"]["Tables"]["articles"]["Row"],
  "id" | "canonical_url" | "content_mode" | "enriched_text" | "enriched_description" | "raw_summary" | "source" | "title">;

function record(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function briefArticleIds(metadata: Json) {
  const value = record(metadata);
  const canonical = typeof value.canonicalArticleId === "string" ? value.canonicalArticleId : "";
  const variants = Array.isArray(value.articleIds)
    ? value.articleIds.filter((id): id is string => typeof id === "string")
    : [];
  return [...new Set([canonical, ...variants].filter(Boolean))].slice(0, 8);
}

function excerpt(value: string, title: string, maxChars: number) {
  const paragraphs = value.replace(/<\/(?:p|div|h[1-6]|li)>/gi, "\n\n")
    .split(/\n\s*\n/u).map((paragraph) => plainTextFromHtml(paragraph)).filter(Boolean);
  const clean = paragraphs.join("\n\n");
  if (clean.length <= maxChars) return clean;
  const titleTerms = new Set((title.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []).slice(0, 8));
  const blocks = paragraphs.flatMap((paragraph) => paragraph.length <= Math.floor(maxChars / 3) ? [paragraph]
    : paragraph.split(/(?<=[.!?])\s+(?=[\p{Lu}"“(])/u).filter(Boolean));
  const scored = blocks.map((block, index) => ({ index, block,
    score: (index === 0 ? 8 : index === 1 ? 4 : 0)
      + (/[0-9]/u.test(block) ? 2 : 0)
      + [...titleTerms].filter((term) => block.toLowerCase().includes(term)).length,
  }));
  const picked = new Set<number>();
  let size = 0;
  for (const item of [...scored].sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (size + item.block.length + 2 > maxChars) continue;
    picked.add(item.index);
    size += item.block.length + 2;
  }
  const selected = scored.filter((item) => picked.has(item.index)).map((item) => item.block).join("\n\n");
  return selected || clean.slice(0, maxChars).replace(/\s+\S*$/, "");
}

export function briefSourceMaterials(metadata: Json, articles: Map<string, BriefArticleSourceRow>): BriefSourceMaterial[] {
  const candidates = briefArticleIds(metadata).flatMap((id) => articles.get(id) ? [articles.get(id)!] : []);
  const primary = candidates[0];
  const secondary = candidates.filter((article) => article.source.trim().toLowerCase() !== primary?.source.trim().toLowerCase())
    .sort((left, right) => Number(right.content_mode === "readable" && Boolean(right.enriched_text))
      - Number(left.content_mode === "readable" && Boolean(left.enriched_text)))[0];
  const selected: BriefArticleSourceRow[] = [primary, secondary].filter((article): article is BriefArticleSourceRow => Boolean(article));
  return selected.map((article, index) => {
    const readable = article.content_mode === "readable" && Boolean(article.enriched_text?.trim());
    const sourceText = readable ? article.enriched_text! : article.enriched_description || article.raw_summary;
    return {
      contentMode: readable ? "readable" : "summary",
      source: article.source,
      text: excerpt(sourceText || "", article.title, index === 0 ? 1_350 : 500),
      title: plainTextFromHtml(article.title).slice(0, 200),
      url: article.canonical_url,
    };
  }).filter((material) => material.text);
}
