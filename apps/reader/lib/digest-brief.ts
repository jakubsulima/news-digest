import "server-only";

import { fallbackDigestBrief } from "./ai-summary";
import { DIGEST_BRIEF_PROMPT_VERSION, materializeBrief } from "./digest-brief-job";
import type { Json } from "./database.types";
import { readingTimeMinutesForDigestBrief } from "./digest-brief-text";
import { createSupabaseAdminClient } from "./supabase";
import type { EvidenceStatus } from "./evidence";
import type { ReaderLocale } from "./reader-locale";

export type DigestBriefHighlight = {
  newsItemId: string;
  source: string;
  sourceUrl: string | null;
  title: string;
  supportsSummary: boolean;
  whatHappened: string;
  whyItMatters: string;
};

export type DigestBriefReference = {
  newsItemId: string;
  source: string;
  sourceUrl: string | null;
  title: string;
};

export type DigestBriefSummaryReference = DigestBriefReference & {
  whatHappened: string;
};

export type DigestBriefSupport = {
  sourceNames?: string[];
  fullTextSourceCount: number;
  independentSourceCount: number;
  status: EvidenceStatus;
};

export type DigestBriefSection = {
  category: string;
  paragraphs: Array<{
    references: DigestBriefReference[];
    support?: DigestBriefSupport;
    text: string;
  }>;
  title: string;
};

export type DigestBriefWatchItem = {
  references: DigestBriefReference[];
  signal: string;
  why: string;
};

export type DigestBrief = {
  generationKind?: "ai" | "fallback" | "legacy";
  generationReason?: string | null;
  createdAt?: string | null;
  digestRunId?: string | null;
  coverageNote: string;
  digestDate: string;
  highlights: DigestBriefHighlight[];
  readingTimeMinutes: number;
  sections: DigestBriefSection[];
  summary: string;
  summaryReferences: DigestBriefSummaryReference[];
  watchlist: DigestBriefWatchItem[];
};

export type LocalizedDigestBrief = DigestBrief & {
  locale: ReaderLocale;
};

export type DigestBriefFallbackArticle = {
  storyClusterId?: string | null;
  category: string;
  digestDate: string;
  id: string;
  preview: { whyItMatters: string } | null;
  source: string;
  sourceUrl?: string;
  summary: string;
  title: string;
  whyInteresting: string | null;
};

type SupabaseError = {
  code?: string;
  message?: string;
};

export function isDigestBriefSchemaError(error: unknown) {
  const supabaseError = error && typeof error === "object" ? (error as SupabaseError) : {};
  return (
    supabaseError.code === "42P01" ||
    supabaseError.code === "42703" ||
    supabaseError.code === "PGRST204" ||
    supabaseError.code === "PGRST205"
  );
}

function parseHighlights(value: Json): DigestBriefHighlight[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const highlight = entry as Record<string, Json | undefined>;
    const newsItemId = typeof highlight.newsItemId === "string" ? highlight.newsItemId : null;
    const source = typeof highlight.source === "string" ? highlight.source : null;
    const sourceUrl = typeof highlight.sourceUrl === "string" ? highlight.sourceUrl : null;
    const title = typeof highlight.title === "string" ? highlight.title : null;
    const supportsSummary = highlight.supportsSummary === true;
    const whatHappened = typeof highlight.whatHappened === "string" ? highlight.whatHappened : null;
    const whyItMatters = typeof highlight.whyItMatters === "string" ? highlight.whyItMatters : null;

    return newsItemId && source && title && whyItMatters
      ? [{ newsItemId, source, sourceUrl, supportsSummary, title, whatHappened: whatHappened || title, whyItMatters }]
      : [];
  });
}

function parseReferences(value: Json | undefined): DigestBriefReference[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const reference = entry as Record<string, Json | undefined>;
    const newsItemId = typeof reference.newsItemId === "string" ? reference.newsItemId : null;
    const source = typeof reference.source === "string" ? reference.source : null;
    const sourceUrl = typeof reference.sourceUrl === "string" ? reference.sourceUrl : null;
    const title = typeof reference.title === "string" ? reference.title : null;

    if (!newsItemId || !source || !title || seen.has(newsItemId)) return [];
    seen.add(newsItemId);
    return [{ newsItemId, source, sourceUrl, title }];
  });
}

function parseParagraphs(section: Record<string, Json | undefined>): DigestBriefSection["paragraphs"] {
  const rawParagraphs = Array.isArray(section.paragraphs)
    ? section.paragraphs
    : typeof section.situation === "string"
      ? [{ text: section.situation, references: section.references }]
      : [];

  return rawParagraphs.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const paragraph = entry as Record<string, Json | undefined>;
    const text = typeof paragraph.text === "string" ? paragraph.text.trim() : "";
    const references = parseReferences(paragraph.references);
    const supportValue = paragraph.support && typeof paragraph.support === "object" && !Array.isArray(paragraph.support)
      ? paragraph.support as Record<string, Json | undefined>
      : {};
    const sourceNames = Array.isArray(supportValue.sourceNames)
      ? supportValue.sourceNames.filter((name): name is string => typeof name === "string" && Boolean(name.trim()))
      : references.map(r => r.source);
    const sourceCount = Math.max(1, new Set(sourceNames.map(name => name.trim().toLowerCase())).size);
    const support: DigestBriefSupport = {
      sourceNames,
      fullTextSourceCount: supportValue.status === "full_text" ? 1 : 0,
      independentSourceCount: sourceCount,
      status: supportValue.status === "full_text" ? "full_text" : sourceCount > 1 ? "corroborated_summary" : "limited",
    };

    return text ? [{ references, support, text }] : [];
  });
}

function parseSections(value: Json): DigestBriefSection[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const section = entry as Record<string, Json | undefined>;
    const category = typeof section.category === "string" ? section.category : null;
    const title = typeof section.title === "string" ? section.title : null;
    const paragraphs = parseParagraphs(section);

    return category && title && paragraphs.length
      ? [{ category, paragraphs, title }]
      : [];
  });
}

function parseWatchlist(value: Json): DigestBriefWatchItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, Json | undefined>;
    const signal = typeof item.signal === "string" ? item.signal : null;
    const why = typeof item.why === "string" ? item.why : null;

    return signal && why ? [{ references: parseReferences(item.references), signal, why }] : [];
  });
}

export function fallbackDigestBriefFromNews(items: DigestBriefFallbackArticle[]): DigestBrief | null {
  const digestDate = items.map(item => item.digestDate).sort().at(-1);
  if (!digestDate) return null;
  const articles = items.filter(item => item.digestDate === digestDate).map((item, index) => ({
    ...item, index, newsItemId: item.id, storyClusterId: item.storyClusterId || item.id,
    importanceScore: 0, publishedAt: null, sourceCount: 1, evidence: {},
    whyInteresting: item.preview?.whyItMatters || item.whyInteresting,
  }));
  const result = materializeBrief(fallbackDigestBrief(articles), {
    articles, interestProfile: { feedTargets: {}, preferredKeywords: [] },
    omitted: { insufficientEvidence: 0, overLimit: 0 }, promptVersion: DIGEST_BRIEF_PROMPT_VERSION, version: 1,
  });
  const urls = new Map(items.map(item => [item.id, item.sourceUrl ?? null]));
  const link = <T extends { newsItemId: string }>(ref: T) => ({ ...ref, sourceUrl: urls.get(ref.newsItemId) ?? null });
  return { ...result, digestDate, generationKind: "fallback", generationReason: "missing_brief",
    highlights: result.highlights.map(link),
    sections: result.sections.map(section => ({ ...section, paragraphs: section.paragraphs.map(p => ({ ...p, references: p.references.map(link) })) })),
    watchlist: [], summaryReferences: result.highlights.map(({ newsItemId, source, title, whatHappened }) => link({ newsItemId, source, title, whatHappened })),
  };
}

export async function getLatestDigestBrief(): Promise<DigestBrief | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("digest_summaries")
    .select("generation_kind, generation_reason, created_at, digest_run_id, coverage_note, digest_date, highlights, reading_time_minutes, sections, summary, watchlist")
    .order("digest_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isDigestBriefSchemaError(error)) {
      return null;
    }

    throw error;
  }

  if (!data) return null;

  const sections = parseSections(data.sections);
  const watchlist = parseWatchlist(data.watchlist);
  const highlights = parseHighlights(data.highlights);
  const summary = data.summary;
  const coverageNote = data.coverage_note;
  const newsItemIds = Array.from(new Set([
    ...highlights.map((highlight) => highlight.newsItemId),
    ...sections.flatMap((section) => section.paragraphs.flatMap((paragraph) => paragraph.references.map((reference) => reference.newsItemId))),
    ...watchlist.flatMap((item) => item.references.map((reference) => reference.newsItemId)),
  ]));
  const sourceUrlByNewsItemId = new Map<string, string>();

  if (newsItemIds.length) {
    const { data: sourceRows, error: sourceError } = await supabase
      .from("news_items")
      .select("id, source_url")
      .in("id", newsItemIds);

    if (sourceError) throw sourceError;

    for (const row of sourceRows) {
      sourceUrlByNewsItemId.set(row.id, row.source_url);
    }
  }

  const withSourceUrl = <T extends { newsItemId: string; sourceUrl: string | null }>(item: T): T => ({
    ...item,
    sourceUrl: sourceUrlByNewsItemId.get(item.newsItemId) ?? item.sourceUrl,
  });
  const linkedSections = sections.map((section) => ({
    ...section,
    paragraphs: section.paragraphs.map((paragraph) => ({
      ...paragraph,
      references: paragraph.references.map(withSourceUrl),
    })),
  }));
  const linkedWatchlist = watchlist.map((item) => ({
    ...item,
    references: item.references.map(withSourceUrl),
  }));
  const linkedHighlights = highlights.map(withSourceUrl);
  const explicitlyLinkedSummaryHighlights = linkedHighlights.filter((highlight) => highlight.supportsSummary);
  const summaryReferences = (explicitlyLinkedSummaryHighlights.length ? explicitlyLinkedSummaryHighlights : linkedHighlights)
    .map(({ newsItemId, source, sourceUrl, title, whatHappened }) => ({ newsItemId, source, sourceUrl, title, whatHappened }));

  return {
    coverageNote,
    digestDate: data.digest_date,
    generationKind: data.generation_kind,
    generationReason: data.generation_reason,
    createdAt: data.created_at,
    digestRunId: data.digest_run_id,
    highlights: linkedHighlights,
    readingTimeMinutes: readingTimeMinutesForDigestBrief({ coverageNote, sections: linkedSections, summary, watchlist: linkedWatchlist }),
    sections: linkedSections,
    summary,
    summaryReferences,
    watchlist: linkedWatchlist,
  };
}
