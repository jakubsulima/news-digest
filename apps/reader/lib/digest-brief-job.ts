import { createHash } from "node:crypto";

import type { Json } from "./database.types";
import { readingTimeMinutesForDigestBrief } from "./digest-brief-text";
import type { DigestBriefSupport } from "./digest-brief";
import type { DigestBriefArticle, NvidiaDigestBrief } from "./ai-summary";

export const DIGEST_BRIEF_PROMPT_VERSION = "digest-brief-v4";
export const LUNA_BRIEF_PROMPT_VERSION = "digest-brief-luna-v2";
export const MAX_BRIEF_ARTICLES = 10;
export const MAX_LUNA_BRIEF_ARTICLES = 20;
const MAX_INPUT_CHARS = 48_000;
const MAX_LUNA_INPUT_CHARS = 80_000;

export type BriefSourceMaterial = {
  contentMode: string;
  source: string;
  text: string;
  title: string;
  url: string;
};

export type FrozenBriefArticle = DigestBriefArticle & {
  evidence: Json;
  index: number;
  newsItemId: string;
  storyClusterId: string;
};

export type BriefInputV1 = {
  articles: FrozenBriefArticle[];
  interestProfile: { feedTargets: Record<string, number>; preferredKeywords: string[] };
  omitted: { insufficientEvidence: number; overLimit: number };
  selectionDecisions?: Array<{ storyClusterId: string; reason: string }>;
  promptVersion: typeof DIGEST_BRIEF_PROMPT_VERSION;
  version: 1;
};

export type BriefInputV2 = Omit<BriefInputV1, "articles" | "promptVersion" | "version"> & {
  articles: Array<FrozenBriefArticle & { sourceMaterials: BriefSourceMaterial[] }>;
  model: "gpt-6-luna";
  promptVersion: typeof LUNA_BRIEF_PROMPT_VERSION;
  provider: "openai";
  version: 2;
};

export type BriefInput = BriefInputV1 | BriefInputV2;

function evidenceRecord(value: Json) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : {};
}

function evidenceStatus(value: Json) {
  const status = evidenceRecord(value).status;
  return status === "full_text" || status === "corroborated_summary" || status === "limited"
    ? status
    : null;
}

function paragraphSupport(input: BriefInput, articleIndexes: number[]): DigestBriefSupport {
  const articles = [...new Set(articleIndexes)].flatMap(index => input.articles[index] ? [input.articles[index]] : []);
  const names = new Set(articles.flatMap(article => {
    const value = evidenceRecord(article.evidence).sourceNames;
    return Array.isArray(value) ? value.filter((name): name is string => typeof name === "string").map(name => name.trim().toLowerCase()).filter(Boolean) : [article.source.trim().toLowerCase()];
  }));
  // Full-text publisher identities are unavailable: report a conservative lower bound.
  const fullTextSourceCount = articles.some(article => evidenceStatus(article.evidence) === "full_text") ? 1 : 0;
  const independentSourceCount = Math.max(1, names.size);
  return { fullTextSourceCount, independentSourceCount, sourceNames: [...names],
    status: fullTextSourceCount ? "full_text" : independentSourceCount > 1 ? "corroborated_summary" : "limited" };

}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function selectBriefArticles(input: Omit<BriefInputV1, "promptVersion" | "version">, limit: number, summaryChars = 2_500) {
  const eligible = input.articles.filter((article) => {
    return evidenceStatus(article.evidence) === "full_text" || evidenceStatus(article.evidence) === "corroborated_summary";
  });
  const newest = Math.max(0, ...eligible.map(a => Date.parse(a.publishedAt || "") || 0));
  const score = (a: FrozenBriefArticle) => a.importanceScore
    + Math.max(0, 5 - (newest - (Date.parse(a.publishedAt || "") || 0)) / 86_400_000)
    + Math.min(3, input.interestProfile.feedTargets[a.category] || 0)
    + Math.min(4, input.interestProfile.preferredKeywords.filter(k => `${a.title} ${a.summary}`.toLowerCase().includes(k.toLowerCase())).length)
    + (evidenceStatus(a.evidence) === "full_text" ? 2 : 1);
  const remaining = [...eligible].sort((a,b) => b.importanceScore - a.importanceScore || score(b)-score(a) || a.storyClusterId.localeCompare(b.storyClusterId) || a.newsItemId.localeCompare(b.newsItemId));
  const ranked: FrozenBriefArticle[] = [];
  const categories = new Map<string, number>();
  while (remaining.length) {
    if (ranked.length) remaining.sort((a,b) => (score(b) - 3 * (categories.get(b.category) || 0)) - (score(a) - 3 * (categories.get(a.category) || 0)) || a.storyClusterId.localeCompare(b.storyClusterId) || a.newsItemId.localeCompare(b.newsItemId));
    const next = remaining.shift()!;
    if (ranked.some(a => a.storyClusterId === next.storyClusterId)) continue;
    ranked.push(next);
    categories.set(next.category, (categories.get(next.category) || 0) + 1);
  }
  const selected = ranked.slice(0, limit).map((article, index) => ({
    ...article,
    index,
    summary: article.summary.slice(0, summaryChars),
    title: article.title.slice(0, 300),
    whyInteresting: article.whyInteresting?.slice(0, 600) ?? null,
  }));
  return {
    articles: selected,
    selectionDecisions: input.articles.map(a => ({ storyClusterId: a.storyClusterId,
      reason: !eligible.includes(a) ? "insufficient_evidence" : selected.some(s => s.newsItemId === a.newsItemId) ? "selected" : ranked.some(s => s.newsItemId === a.newsItemId) ? "over_limit" : "duplicate_story",
    })).sort((a,b) => a.storyClusterId.localeCompare(b.storyClusterId) || a.reason.localeCompare(b.reason)),
    interestProfile: {
      feedTargets: input.interestProfile.feedTargets,
      preferredKeywords: input.interestProfile.preferredKeywords.slice(0, 50).map((value) => value.slice(0, 100)),
    },
    omitted: {
      insufficientEvidence: input.articles.length - eligible.length,
      overLimit: Math.max(0, ranked.length - limit),
    },
  };
}

export function buildBriefInput(input: Omit<BriefInputV1, "promptVersion" | "version">) {
  const payload: BriefInputV1 = {
    ...selectBriefArticles(input, MAX_BRIEF_ARTICLES),
    promptVersion: DIGEST_BRIEF_PROMPT_VERSION,
    version: 1,
  };
  const serialized = canonical(payload);
  if (serialized.length > MAX_INPUT_CHARS) throw new Error("Frozen briefing input exceeds its size limit.");
  return { hash: createHash("sha256").update(serialized).digest("hex"), payload };
}

export function buildBriefInputV2(input: Omit<BriefInputV2, "promptVersion" | "version" | "model" | "provider">) {
  const selected = selectBriefArticles(input, MAX_LUNA_BRIEF_ARTICLES, 800);
  const payload: BriefInputV2 = {
    ...selected,
    articles: selected.articles.map((article) => ({ ...article,
      sourceMaterials: input.articles.find((source) => source.newsItemId === article.newsItemId)?.sourceMaterials ?? [],
    })),
    model: "gpt-6-luna",
    promptVersion: LUNA_BRIEF_PROMPT_VERSION,
    provider: "openai",
    version: 2,
  };
  const serialized = canonical(payload);
  if (serialized.length > MAX_LUNA_INPUT_CHARS) throw new Error("Frozen Luna briefing input exceeds its size limit.");
  return { hash: createHash("sha256").update(serialized).digest("hex"), payload };
}

export function materializeBrief(brief: NvidiaDigestBrief, input: BriefInput) {
  const reference = (index: number) => {
    const article = input.articles[index];
    return article ? { newsItemId: article.newsItemId, source: article.source, title: article.title } : null;
  };
  const highlights = brief.highlights.flatMap((item) => {
    const linked = reference(item.articleIndex);
    return linked ? [{ ...linked, supportsSummary: brief.summaryArticleIndexes.includes(item.articleIndex), whatHappened: item.whatHappened, whyItMatters: item.whyItMatters }] : [];
  });
  const sections = brief.sections.flatMap((section) => {
    const paragraphs = section.paragraphs.flatMap((paragraph) => {
      const references = [...new Set(paragraph.articleIndexes)].flatMap((index) => {
        const linked = reference(index); return linked ? [linked] : [];
      });
      return references.length ? [{
        text: paragraph.text,
        references,
        support: paragraphSupport(input, paragraph.articleIndexes),
      }] : [];
    });
    return paragraphs.length ? [{ category: section.category, kind: section.kind, paragraphs, title: section.title }] : [];
  });
  const watchlist = brief.watchlist.map((item) => ({
    references: item.articleIndexes.flatMap((index) => { const linked = reference(index); return linked ? [linked] : []; }),
    signal: item.signal,
    why: item.why,
  }));
  const coverageNote = [
    brief.coverageNote,
    input.omitted.insufficientEvidence
      ? `${input.omitted.insufficientEvidence} materiałów o ograniczonym pokryciu pominięto w syntezie.`
      : null,
    input.omitted.overLimit
      ? `${input.omitted.overLimit} dalszych materiałów nie weszło do ograniczonego wejścia briefingu.`
      : null,
  ].filter(Boolean).join(" ");
  return {
    coverageNote,
    highlights,
    readingTimeMinutes: readingTimeMinutesForDigestBrief({ coverageNote, sections, summary: brief.summary, watchlist }),
    sections,
    summary: brief.summary,
    watchlist,
  };
}
