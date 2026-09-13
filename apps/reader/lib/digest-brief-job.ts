import { createHash } from "node:crypto";

import type { Json } from "./database.types";
import { readingTimeMinutesForDigestBrief } from "./digest-brief-text";
import type { DigestBriefSupport } from "./digest-brief";
import type { DigestBriefArticle, NvidiaDigestBrief } from "./ai-summary";

export const DIGEST_BRIEF_PROMPT_VERSION = "digest-brief-v3";
export const MAX_BRIEF_ARTICLES = 10;
const MAX_INPUT_CHARS = 48_000;

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
  promptVersion: typeof DIGEST_BRIEF_PROMPT_VERSION;
  version: 1;
};

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

function paragraphSupport(input: BriefInputV1, articleIndexes: number[]): DigestBriefSupport {
  const evidence = articleIndexes.flatMap((index) => {
    const article = input.articles[index];
    if (!article) return [];
    const details = evidenceRecord(article.evidence);
    const status = evidenceStatus(article.evidence);
    const reportedFullTextSourceCount = typeof details.fullTextSourceCount === "number"
      ? Math.max(0, details.fullTextSourceCount)
      : 0;
    const reportedIndependentSourceCount = typeof details.independentSourceCount === "number"
      ? Math.max(1, details.independentSourceCount)
      : Math.max(1, article.sourceCount);
    return [{
      fullTextSourceCount: status === "full_text" ? Math.max(1, reportedFullTextSourceCount) : reportedFullTextSourceCount,
      independentSourceCount: status === "corroborated_summary"
        ? Math.max(2, reportedIndependentSourceCount)
        : reportedIndependentSourceCount,
      status,
    }];
  });
  const fullTextSourceCount = evidence.reduce((total, item) => total + item.fullTextSourceCount, 0);
  const independentSourceCount = Math.max(1, evidence.reduce((total, item) => total + item.independentSourceCount, 0));

  return {
    fullTextSourceCount,
    independentSourceCount,
    status: fullTextSourceCount > 0 || evidence.some((item) => item.status === "full_text")
      ? "full_text"
      : independentSourceCount > 1 || evidence.some((item) => item.status === "corroborated_summary")
        ? "corroborated_summary"
        : "limited",
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildBriefInput(input: Omit<BriefInputV1, "promptVersion" | "version">) {
  const eligible = input.articles.filter((article) => {
    return evidenceStatus(article.evidence) === "full_text" || evidenceStatus(article.evidence) === "corroborated_summary";
  });
  const selected = eligible.slice(0, MAX_BRIEF_ARTICLES).map((article, index) => ({
    ...article,
    index,
    summary: article.summary.slice(0, 2_500),
    title: article.title.slice(0, 300),
    whyInteresting: article.whyInteresting?.slice(0, 600) ?? null,
  }));
  const payload: BriefInputV1 = {
    articles: selected,
    interestProfile: {
      feedTargets: input.interestProfile.feedTargets,
      preferredKeywords: input.interestProfile.preferredKeywords.slice(0, 50).map((value) => value.slice(0, 100)),
    },
    omitted: {
      insufficientEvidence: input.articles.length - eligible.length,
      overLimit: Math.max(0, eligible.length - MAX_BRIEF_ARTICLES),
    },
    promptVersion: DIGEST_BRIEF_PROMPT_VERSION,
    version: 1,
  };
  const serialized = canonical(payload);
  if (serialized.length > MAX_INPUT_CHARS) throw new Error("Frozen briefing input exceeds its size limit.");
  return { hash: createHash("sha256").update(serialized).digest("hex"), payload };
}

export function materializeBrief(brief: NvidiaDigestBrief, input: BriefInputV1) {
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
    return paragraphs.length ? [{ category: section.category, paragraphs, title: section.title }] : [];
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
