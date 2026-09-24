import "server-only";

import type { Database, Json } from "../../database.types";
import { getDigestRunById } from "../../digest-runs";
import { getDigestSettingsForRun } from "../../digest-settings";
import { fallbackDigestBrief } from "../../ai-summary";
import { briefArticleIds, briefSourceMaterials, type BriefArticleSourceRow } from "../../brief-source-material";
import { buildBriefInput, buildBriefInputV2, materializeBrief, type BriefInput } from "../../digest-brief-job";
import { evidenceDetailsFromSignals } from "../../evidence";
import { createSupabaseAdminClient } from "../../supabase";
import { cleanArticleSummary, plainTextFromHtml } from "../../text";
import { SUPABASE_WRITE_BATCH_SIZE } from "../constants";
import type { StageRunner } from "../types";
import { chunk, compactText, jsonNumber, jsonString, jsonStringArray } from "../utils";

/** @deprecated v1 compatibility only; v2 retries in the dedicated AI stage. */
export function shouldRetryAiBriefGeneration(status: string, attempt: number) {
  return status === "retryable_failure" && attempt < 3;
}

type NewsItemInsert = Database["public"]["Tables"]["news_items"]["Insert"];

type StorySnapshotRow = Database["public"]["Tables"]["story_snapshots"]["Row"];

function jsonRecord(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function publishedSummary(snapshot: StorySnapshotRow) {
  return jsonString(snapshot.metadata, "summary") || jsonString(snapshot.metadata, "title") || "No summary available.";
}

function compactPublishedSummary({
  maxChars,
  summary,
  title,
}: {
  maxChars: number;
  summary: string;
  title: string;
}) {
  const cleanSummary = cleanArticleSummary(summary, title) || plainTextFromHtml(title);
  return compactText(cleanSummary, maxChars);
}

const NEWS_RETENTION_DAYS = 90;
const EVENT_RETENTION_DAYS = 180;

export function readerExternalIdForStory(storyClusterId: string) {
  return `story:${storyClusterId}`;
}

export function deletableExpiredNewsItemIds(
  staleIds: string[],
  savedIds: Iterable<string>,
  notedIds: Iterable<string> = [],
) {
  const saved = new Set(savedIds);
  const noted = new Set(notedIds);
  return staleIds.filter((id) => !saved.has(id) && !noted.has(id));
}

export function deriveTopicTags(title: string, category: string, practicalBucket: string) {
  const tags = [category, practicalBucket.replace(/_/g, " ")]
    .map((tag) => plainTextFromHtml(tag).trim().toLowerCase())
    .filter(Boolean);
  const titleKeywords = title
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((word) => word.length >= 5)
    .slice(0, 5) || [];

  return Array.from(new Set([...tags, ...titleKeywords])).slice(0, 8);
}

export function deriveEntityTags(title: string) {
  return Array.from(
    new Set(
      title.match(/\b[\p{Lu}][\p{L}\p{N}-]{2,}(?:\s+[\p{Lu}][\p{L}\p{N}-]{2,})*/gu) || [],
    ),
  ).slice(0, 8);
}

async function cleanupExpiredReaderData() {
  const supabase = createSupabaseAdminClient();
  const newsCutoff = new Date(Date.now() - NEWS_RETENTION_DAYS * 86_400_000).toISOString();
  const eventCutoff = new Date(Date.now() - EVENT_RETENTION_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("news_items")
    .select("id")
    .lt("last_selected_at", newsCutoff)
    .limit(1000);

  if (error) {
    throw error;
  }

  const staleIds = (data || []).map((item) => item.id);
  const savedIds = new Set<string>();
  const notedIds = new Set<string>();

  for (const staleBatch of chunk(staleIds, SUPABASE_WRITE_BATCH_SIZE)) {
    const { data: savedStates, error: savedError } = await supabase
      .from("reader_item_states")
      .select("news_item_id")
      .in("news_item_id", staleBatch)
      .not("saved_at", "is", null);

    if (savedError) throw savedError;
    for (const state of savedStates || []) savedIds.add(state.news_item_id);

    const { data: notes, error: notesError } = await supabase
      .from("reader_notes")
      .select("news_item_id")
      .in("news_item_id", staleBatch);

    if (notesError) throw notesError;
    for (const note of notes || []) {
      if (note.news_item_id) notedIds.add(note.news_item_id);
    }
  }

  const deletableIds = deletableExpiredNewsItemIds(staleIds, savedIds, notedIds);

  for (const staleBatch of chunk(deletableIds, SUPABASE_WRITE_BATCH_SIZE)) {
    const { error: deleteError } = await supabase.from("news_items").delete().in("id", staleBatch);

    if (deleteError) {
      throw deleteError;
    }
  }

  const { count: deletedEventCount, error: eventCleanupError } = await supabase
    .from("reader_feed_events")
    .delete({ count: "exact" })
    .lt("created_at", eventCutoff);

  if (eventCleanupError) throw eventCleanupError;

  return { deletedEventCount: deletedEventCount || 0, deletedNewsItemCount: deletableIds.length };
}

export const runReaderPublicationStage: StageRunner = async ({ digestRunId }) => {
  const run = await getDigestRunById(digestRunId);
  const settings = await getDigestSettingsForRun(digestRunId);

  if (!run) {
    throw new Error("Digest run not found.");
  }

  const supabase = createSupabaseAdminClient();
  const { data: snapshots, error } = await supabase
    .from("story_snapshots")
    .select("*")
    .eq("digest_run_id", digestRunId)
    .eq("is_selected", true)
    .order("editorial_score", { ascending: false })
    .limit(settings.publishTopN);

  if (error) {
    throw error;
  }

  const selectedSnapshots = snapshots || [];
  const clusterIds = selectedSnapshots.map((snapshot) => snapshot.story_cluster_id);
  const { data: existingItems, error: existingError } = clusterIds.length
    ? await supabase
        .from("news_items")
        .select("story_cluster_id, first_selected_at, last_material_change_at")
        .in("story_cluster_id", clusterIds)
    : { data: [], error: null };

  if (existingError) throw existingError;

  const existingByClusterId = new Map((existingItems || []).map((item) => [item.story_cluster_id, item]));

  const rows: NewsItemInsert[] = [];
  const selectedAt = new Date().toISOString();

  for (const snapshot of selectedSnapshots) {
    const canonicalUrl = jsonString(snapshot.metadata, "canonicalUrl");
    const title = jsonString(snapshot.metadata, "title") || canonicalUrl;
    const metadata = jsonRecord(snapshot.metadata);
    const scoreComponents = metadata.scoreComponents;
    const sourceVariants = Array.isArray(metadata.sourceVariants) ? metadata.sourceVariants : [];
    const contentModes = Array.isArray(metadata.contentModes)
      ? metadata.contentModes.filter((value): value is string => typeof value === "string")
      : [];
    const evidence = evidenceDetailsFromSignals({
      contentModes,
      explicitStatus: jsonRecord(metadata.evidence || {}).status,
      fullTextSourceCount: jsonNumber(jsonRecord(metadata.evidence || {}), "fullTextSourceCount"),
      hasReadableVariant: metadata.hasReadableVariant === true,
      sourceCount: Math.max(1, sourceVariants.length || snapshot.duplicate_count),
      sourceNames: sourceVariants.flatMap((variant) => {
        const source = jsonString(variant, "name");
        return source ? [source] : [];
      }),
    });
    const changedFields = jsonStringArray(snapshot.changed_fields);
    const practicalBucket = jsonString(snapshot.metadata, "practicalBucket") || "ignore";
    const existingItem = existingByClusterId.get(snapshot.story_cluster_id);
    const sourceSummary = publishedSummary(snapshot);
    const summary = compactPublishedSummary({
      maxChars: settings.summaryMaxChars,
      summary: sourceSummary,
      title,
    });

    rows.push({
      category: jsonString(snapshot.metadata, "category") || "general",
      changed_fields: changedFields,
      digest_date: run.report_date,
      editorial_score: snapshot.editorial_score,
      entity_tags: deriveEntityTags(title),
      external_id: readerExternalIdForStory(snapshot.story_cluster_id),
      first_selected_at: existingItem?.first_selected_at || selectedAt,
      importance_score: Math.max(0, Math.min(100, Math.round(snapshot.editorial_score))),
      last_material_change_at: changedFields.length
        ? selectedAt
        : existingItem?.last_material_change_at || null,
      last_selected_at: selectedAt,
      published_at: jsonString(snapshot.metadata, "publishedAt") || null,
      raw_payload: {
        digestRunId,
        contentModes,
        evidence,
        hasReadableVariant: evidence.fullTextSourceCount > 0,
        practicalBucket,
        recommendedAction: jsonString(snapshot.metadata, "recommendedAction"),
        score: {
          components:
            scoreComponents && typeof scoreComponents === "object" && !Array.isArray(scoreComponents)
              ? scoreComponents
              : {},
          editorial: snapshot.editorial_score,
          importance: Math.max(0, Math.min(100, Math.round(snapshot.editorial_score))),
        },
        storyClusterId: snapshot.story_cluster_id,
        whyInteresting: jsonString(snapshot.metadata, "whyInteresting"),
      },
      source: jsonString(snapshot.metadata, "source") || "Unknown",
      source_count: Math.max(1, sourceVariants.length || snapshot.duplicate_count),
      source_variants: sourceVariants,
      source_url: canonicalUrl,
      selection_score: jsonNumber(snapshot.metadata, "selectionScore") || jsonNumber(scoreComponents || {}, "selection") || snapshot.editorial_score,
      story_cluster_id: snapshot.story_cluster_id,
      summary,
      title: plainTextFromHtml(title),
      topic_tags: deriveTopicTags(title, jsonString(snapshot.metadata, "category") || "general", practicalBucket),
    });
  }

  if (rows.length) {
    const { error: upsertError } = await supabase.from("news_items").upsert(rows, {
      onConflict: "story_cluster_id",
    });

    if (upsertError) {
      throw upsertError;
    }

    await Promise.all(rows.map(async (row) => {
      if (!row.story_cluster_id) return;
      const { error: clusterTagError } = await supabase
        .from("story_clusters")
        .update({ entity_tags: row.entity_tags, topic_tags: row.topic_tags })
        .eq("id", row.story_cluster_id);
      if (clusterTagError) throw clusterTagError;
    }));
  }

  const publishedItems = rows.length
    ? await supabase.from("news_items").select("id, story_cluster_id").in("story_cluster_id", clusterIds)
    : { data: [], error: null };
  if (publishedItems.error) throw publishedItems.error;
  const newsItemByCluster = new Map((publishedItems.data || []).map((item) => [item.story_cluster_id, item.id]));
  const { data: existingJob, error: existingJobError } = await supabase.from("digest_brief_jobs")
    .select("input_hash,input_payload,status,reason").eq("digest_run_id", digestRunId).maybeSingle();
  if (existingJobError) throw existingJobError;
  const useLuna = !existingJob && settings.useAiSummaries && Boolean(process.env.OPENAI_API_KEY)
    && process.env.DIGEST_BRIEF_OPENAI_ENABLED !== "false";
  const articleById = new Map<string, BriefArticleSourceRow>();
  if (useLuna) {
    const articleIds = [...new Set(selectedSnapshots.flatMap((snapshot) => briefArticleIds(snapshot.metadata)))];
    for (const ids of chunk(articleIds, 40)) {
      const { data, error: articleError } = await supabase.from("articles")
        .select("id,canonical_url,content_mode,enriched_text,enriched_description,raw_summary,source,title")
        .in("id", ids);
      if (articleError) throw articleError;
      for (const article of data || []) articleById.set(article.id, article);
    }
  }
  const snapshotByCluster = new Map(selectedSnapshots.map((snapshot) => [snapshot.story_cluster_id, snapshot]));
  const briefingArticles = rows.flatMap((row) => {
    const storyClusterId = row.story_cluster_id;
    const newsItemId = storyClusterId ? newsItemByCluster.get(storyClusterId) : null;
    if (!storyClusterId || !newsItemId) return [];
    const raw = row.raw_payload && typeof row.raw_payload === "object" && !Array.isArray(row.raw_payload)
      ? row.raw_payload as Record<string, Json | undefined> : {};
    return [{
    category: row.category,
    evidence: raw.evidence ?? {},
    index: 0,
    importanceScore: row.importance_score || 0,
    newsItemId,
    publishedAt: row.published_at || null,
    source: row.source,
    sourceCount: row.source_count || 1,
    storyClusterId,
    sourceMaterials: useLuna ? briefSourceMaterials(snapshotByCluster.get(storyClusterId)?.metadata ?? {}, articleById) : [],
    summary: row.summary,
    title: row.title,
    whyInteresting: jsonString(row.raw_payload || {}, "whyInteresting") || null,
  }];
  });
  const briefInput = {
    articles: briefingArticles,
    interestProfile: { feedTargets: settings.feedTargets, preferredKeywords: settings.preferredKeywords },
    omitted: { insufficientEvidence: 0, overLimit: 0 },
  };
  const frozen = existingJob
    ? { hash: existingJob.input_hash, payload: existingJob.input_payload as unknown as BriefInput }
    : useLuna ? buildBriefInputV2(briefInput) : buildBriefInput(briefInput);
  const reason = existingJob?.reason || (!rows.length ? "no_articles" : !settings.useAiSummaries ? "disabled" : !frozen.payload.articles.length ? "insufficient_evidence" : "pending");
  const fallback = materializeBrief(fallbackDigestBrief(frozen.payload.articles), frozen.payload);
  if (!existingJob) {
    const { error: jobError } = await supabase.from("digest_brief_jobs").insert({
      digest_run_id: digestRunId, input_hash: frozen.hash, input_payload: frozen.payload,
      prompt_version: frozen.payload.promptVersion,
      reason: reason === "pending" ? null : reason,
      status: reason === "pending" ? "pending" : "skipped",
      completed_at: reason === "pending" ? null : new Date().toISOString(),
    });
    if (jobError) throw jobError;
  }
  const { error: digestSummaryError } = existingJob?.status === "generated" ? { error: null } : await supabase.from("digest_summaries").upsert({
    coverage_note: fallback.coverageNote, digest_date: run.report_date, digest_run_id: digestRunId,
    generation_kind: "fallback", generation_reason: reason, highlights: fallback.highlights,
    input_hash: frozen.hash, prompt_version: frozen.payload.promptVersion,
    reading_time_minutes: fallback.readingTimeMinutes, sections: fallback.sections,
    summary: fallback.summary, watchlist: fallback.watchlist,
  }, { onConflict: "digest_run_id" });
  if (digestSummaryError) throw digestSummaryError;

  return {
    metrics: {
      briefInputCount: frozen.payload.articles.length,
      briefInputHash: frozen.hash,
      briefStatus: reason,
      publishedCount: rows.length,
      settings: {
        publishTopN: settings.publishTopN,
        summaryMaxChars: settings.summaryMaxChars,
        useAiSummaries: settings.useAiSummaries,
      },
    },
  };
};
