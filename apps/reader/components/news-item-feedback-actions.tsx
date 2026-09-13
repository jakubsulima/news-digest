"use client";

import { Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useState } from "react";

import { useLocalize } from "@/components/reader-locale-provider";
import { Button } from "@/components/ui/button";
import type { FeedbackReason, FeedbackSentiment } from "@/lib/reader-feedback";
import { cn } from "@/lib/utils";

type NewsItemFeedbackActionsProps = {
  buttonClassName?: string;
  buttonSize?: "sm" | "icon-sm" | "icon-lg" | "lg";
  className?: string;
  itemId: string;
  feedback: FeedbackSentiment | null;
  feedbackReason?: FeedbackReason | null;
  likeOnly?: boolean;
  busy?: boolean;
  onPendingChange?: (pending: boolean) => void;
  showLabels?: boolean;
  onFeedbackChange?: (feedback: FeedbackSentiment | null, reason: FeedbackReason | null) => void;
};

async function apiFeedback(itemId: string, sentiment: FeedbackSentiment | null, reason: FeedbackReason) {
  return fetch(`/api/news-items/${itemId}/feedback`, {
    body: JSON.stringify({ reason, sentiment }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
}

export function NewsItemFeedbackActions({
  buttonClassName,
  buttonSize = "icon-lg",
  className,
  itemId,
  feedback,
  feedbackReason = null,
  likeOnly = false,
  busy = false,
  onPendingChange,
  showLabels = false,
  onFeedbackChange,
}: NewsItemFeedbackActionsProps) {
  const l = useLocalize();
  const [localFeedback, setLocalFeedback] = useState(feedback);
  const [localReason, setLocalReason] = useState<FeedbackReason | null>(feedbackReason);
  const [pendingFeedback, setPendingFeedback] = useState<FeedbackSentiment | null>(null);
  const [reasonMenuOpen, setReasonMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeFeedback = onFeedbackChange ? feedback : localFeedback;
  const activeReason = onFeedbackChange ? feedbackReason : localReason;

  useEffect(() => {
    if (!onFeedbackChange) {
      setLocalFeedback(feedback);
      setLocalReason(feedbackReason);
    }
  }, [feedback, feedbackReason, onFeedbackChange]);

  function applyFeedback(nextFeedback: FeedbackSentiment | null, reason: FeedbackReason | null) {
    if (onFeedbackChange) {
      onFeedbackChange(nextFeedback, reason);
      return;
    }

    setLocalFeedback(nextFeedback);
    setLocalReason(reason);
  }

  async function updateFeedback(sentiment: FeedbackSentiment | null, reason: FeedbackReason = "topic") {
    if (pendingFeedback || busy) {
      return;
    }

    const nextFeedback = sentiment;
    const previousFeedback = activeFeedback;
    const previousReason = activeReason;

    setError(null);
    onPendingChange?.(true);
    setPendingFeedback(sentiment || activeFeedback || "less");
    setReasonMenuOpen(false);
    applyFeedback(nextFeedback, nextFeedback ? reason : null);

    try {
      const response = await apiFeedback(itemId, nextFeedback, reason);
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || l("Nie udało się zapisać preferencji.", "Could not save your preference."));
      }
    } catch (updateError) {
      applyFeedback(previousFeedback, previousReason);
      setError(updateError instanceof Error ? updateError.message : l("Nie udało się zapisać preferencji.", "Could not save your preference."));
    } finally {
      setPendingFeedback(null);
      onPendingChange?.(false);
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Button
        variant={activeFeedback === "more" ? "secondary" : "outline"}
        size={buttonSize}
        className={buttonClassName}
        type="button"
        title={likeOnly
          ? activeFeedback === "more"
            ? l("Usuń polubienie", "Remove like")
            : l("Polub ten news", "Like this story")
          : l("Więcej takich newsów", "More stories like this")}
        aria-label={likeOnly
          ? activeFeedback === "more"
            ? l("Usuń polubienie", "Remove like")
            : l("Polub ten news", "Like this story")
          : l("Więcej takich newsów", "More stories like this")}
        aria-pressed={activeFeedback === "more"}
        disabled={busy || pendingFeedback !== null}
        onClick={() => void updateFeedback(activeFeedback === "more" ? null : "more", "topic")}
      >
        {pendingFeedback === "more" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ThumbsUp aria-hidden="true" />}
        {showLabels ? (
          <span>{likeOnly ? activeFeedback === "more" ? l("Polubiono", "Liked") : l("Lubię", "Like") : l("Więcej", "More")}</span>
        ) : null}
      </Button>
      {!likeOnly ? (
        <Button
          variant={activeFeedback === "less" ? "destructive" : "outline"}
          size={buttonSize}
          className={buttonClassName}
          type="button"
          title={l("Mniej takich newsów", "Fewer stories like this")}
          aria-label={l("Mniej takich newsów", "Fewer stories like this")}
          aria-pressed={activeFeedback === "less"}
          disabled={busy || pendingFeedback !== null}
          onClick={() => activeFeedback === "less" ? void updateFeedback(null, activeReason || "topic") : setReasonMenuOpen((value) => !value)}
        >
          {pendingFeedback === "less" ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <ThumbsDown aria-hidden="true" />
          )}
          {showLabels ? <span>{l("Mniej", "Less")}</span> : null}
        </Button>
      ) : null}
      {!likeOnly && activeFeedback === "more" ? (
        <div className="flex flex-wrap gap-1" role="group" aria-label={l("Co preferować?", "What should be preferred?")}>
          <Button
            variant={activeReason === "source" ? "secondary" : "ghost"}
            size="sm"
            type="button"
            disabled={busy || pendingFeedback !== null}
            onClick={() => void updateFeedback("more", "source")}
          >
            {l("Preferuj źródło", "Prefer source")}
          </Button>
          <Button
            variant={activeReason === "entity" ? "secondary" : "ghost"}
            size="sm"
            type="button"
            disabled={busy || pendingFeedback !== null}
            onClick={() => void updateFeedback("more", "entity")}
          >
            {l("Preferuj temat", "Prefer topic")}
          </Button>
        </div>
      ) : null}
      {!likeOnly && reasonMenuOpen ? (
        <div className="flex flex-wrap gap-1" role="group" aria-label={l("Dlaczego pokazywać mniej takich newsów?", "Why show fewer stories like this?")}>
          {([
            ["topic", l("Temat", "Topic")],
            ["entity", l("Osoba lub firma", "Person or company")],
            ["source", l("Źródło", "Source")],
            ["repetitive", l("Powtarzalne", "Repetitive")],
            ["quality", l("Niska jakość", "Low quality")],
          ] as const).map(([reason, label]) => (
            <Button key={reason} type="button" size="sm" variant="outline" onClick={() => void updateFeedback("less", reason)}>
              {label}
            </Button>
          ))}
        </div>
      ) : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
