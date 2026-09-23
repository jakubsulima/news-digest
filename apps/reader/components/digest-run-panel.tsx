"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Activity, CalendarDays, Check, Circle, Download, Loader2, RotateCcw, Sparkles, X } from "lucide-react";

import { useLocalize, useReaderLocale } from "@/components/reader-locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { localize, type ReaderLocale } from "@/lib/reader-locale";
import { cn } from "@/lib/utils";

type StageStatus = "queued" | "running" | "succeeded" | "failed" | "skipped";
type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

type DigestStage = {
  id: string;
  stage_name: string;
  status: StageStatus;
  error_message: string | null;
};

type DigestRun = {
  id: string;
  report_date: string;
  status: RunStatus;
  stages: DigestStage[];
  briefJob?: { status: string; reason: string | null; completed_at: string | null } | null;
};

type DigestRunPanelProps = {
  initialRun: DigestRun | null;
  retrySlot?: ReactNode;
  storyCount?: number;
};

type ApiPayload<T> = Partial<T> & {
  ok: boolean;
  error?: string;
};

const STAGE_COPY: Record<string, { labels: readonly [string, string]; verbs: readonly [string, string] }> = {
  source_fetch: { labels: ["Źródła", "Sources"], verbs: ["Pobieram źródła", "Fetching sources"] },
  article_normalization: { labels: ["Artykuły", "Articles"], verbs: ["Porządkuję artykuły", "Organising articles"] },
  story_clustering: { labels: ["Tematy", "Topics"], verbs: ["Łączę powiązane newsy", "Grouping related stories"] },
  enrichment: { labels: ["Analiza", "Analysis"], verbs: ["Czytam najważniejsze materiały", "Reading the most important stories"] },
  editorial_scoring: { labels: ["Ocena", "Scoring"], verbs: ["Układam najważniejsze newsy", "Ranking the most important stories"] },
  reader_publication: { labels: ["Publikacja", "Publishing"], verbs: ["Przygotowuję Twój feed", "Preparing your feed"] },
  ai_brief: { labels: ["Podsumowanie AI", "AI briefing"], verbs: ["Wiadomości gotowe — trwa podsumowanie", "Stories ready — generating briefing"] },
  finalization: { labels: ["Gotowe", "Done"], verbs: ["Kończę aktualizację", "Finishing the update"] },
};
const ACTIVE_STATUS_REFRESH_MS = 4_000;

function formatRunStatus(status: RunStatus | null, locale: ReaderLocale) {
  if (status === "queued") return localize(locale, "W kolejce", "Queued");
  if (status === "running") return localize(locale, "W toku", "Running");
  if (status === "succeeded") return localize(locale, "Gotowe", "Done");
  if (status === "failed") return localize(locale, "Błąd", "Error");
  if (status === "cancelled") return localize(locale, "Anulowano", "Cancelled");
  return localize(locale, "Gotowe", "Ready");
}

function isActiveRun(run: DigestRun | null) {
  return run?.status === "queued" || run?.status === "running";
}

function stageCopy(stageName: string, locale: ReaderLocale) {
  const copy = STAGE_COPY[stageName];
  return copy
    ? { label: localize(locale, copy.labels[0], copy.labels[1]), verb: localize(locale, copy.verbs[0], copy.verbs[1]) }
    : { label: stageName.replaceAll("_", " "), verb: localize(locale, "Pracuję", "Working") };
}

function displayRunError(value: string | null | undefined, locale: ReaderLocale) {
  if (!value) return null;
  if (value.includes("UND_ERR_HEADERS_OVERFLOW") || value.includes("request URL")) {
    return localize(locale, "Nie udało się przetworzyć wszystkich newsów. Ponów etap, aby kontynuować.", "Not all stories could be processed. Retry the stage to continue.");
  }
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 240 ? `${compact.slice(0, 239).trimEnd()}…` : compact;
}

async function readApiPayload<T>(response: Response, fallbackError: string): Promise<ApiPayload<T>> {
  const text = await response.text();

  if (!text) {
    return response.ok ? ({ ok: true } as ApiPayload<T>) : ({ ok: false, error: fallbackError } as ApiPayload<T>);
  }

  try {
    return JSON.parse(text) as ApiPayload<T>;
  } catch {
    return {
      ok: false,
      error: response.ok ? fallbackError : `${fallbackError} (${response.status})`,
    } as ApiPayload<T>;
  }
}

export function DigestRunPanel({ initialRun, retrySlot, storyCount }: DigestRunPanelProps) {
  const router = useRouter();
  const locale = useReaderLocale();
  const l = useLocalize();
  const [run, setRun] = useState(initialRun);
  const [isStarting, setIsStarting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const isAdvancingRef = useRef(false);
  const refreshedTerminalRunRef = useRef<string | null>(null);

  const sortedStages = useMemo(() => run?.stages ?? [], [run]);
  const displayStages = sortedStages.length
    ? sortedStages
    : Object.keys(STAGE_COPY).map((stageName) => ({
        error_message: null,
        id: stageName,
        stage_name: stageName,
        status: "queued" as StageStatus,
      }));
  const completedStageCount = displayStages.filter((stage) => stage.status === "succeeded").length;
  const failedStage = displayStages.find((stage) => stage.status === "failed") ?? null;
  const runningStage = displayStages.find((stage) => stage.status === "running") ?? null;
  const queuedStage = displayStages.find((stage) => stage.status === "queued") ?? null;
  const currentStage = failedStage ?? runningStage ?? queuedStage ?? displayStages.at(-1) ?? null;
  const currentCopy = currentStage ? stageCopy(currentStage.stage_name, locale) : null;
  const active = isActiveRun(run);
  const progress = displayStages.length ? Math.round((completedStageCount / displayStages.length) * 100) : 0;
  const visibleError = displayRunError(clientError || failedStage?.error_message, locale);

  const refreshRun = useCallback(async () => {
    const response = await fetch("/api/digest-runs", { cache: "no-store" });
    const payload = await readApiPayload<{ run?: DigestRun | null }>(response, l("Nie udało się odczytać stanu digestu.", "Could not read the digest status."));

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || l("Nie udało się odczytać stanu digestu.", "Could not read the digest status."));
    }

    const nextRun = payload.run ?? null;
    const terminalRefreshKey =
      nextRun && (nextRun.status === "succeeded" || nextRun.status === "failed" || nextRun.status === "cancelled")
        ? `${nextRun.id}:${nextRun.status}`
        : null;

    setRun(nextRun);

    if (terminalRefreshKey && refreshedTerminalRunRef.current !== terminalRefreshKey) {
      refreshedTerminalRunRef.current = terminalRefreshKey;
      router.refresh();
    }

    return nextRun;
  }, [l, router]);

  const advanceRun = useCallback(async () => {
    if (isAdvancingRef.current) {
      return null;
    }

    isAdvancingRef.current = true;

    try {
      const response = await fetch("/api/digest-runs/advance", {
        cache: "no-store",
        method: "POST",
      });
      const payload = await readApiPayload<Record<string, never>>(response, l("Nie udało się kontynuować pobierania.", "Could not continue downloading."));

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || l("Nie udało się kontynuować pobierania.", "Could not continue downloading."));
      }

      setClientError(null);
      return null;
    } finally {
      isAdvancingRef.current = false;
    }
  }, [l]);

  const startRun = useCallback(async () => {
    setIsStarting(true);
    setClientError(null);

    try {
      const response = await fetch("/api/digest-runs", { method: "POST" });
      const payload = await readApiPayload<{ run?: DigestRun }>(response, l("Nie udało się rozpocząć pobierania.", "Could not start downloading."));

      if (!response.ok || !payload.ok || !payload.run) {
        throw new Error(payload.error || l("Nie udało się rozpocząć pobierania.", "Could not start downloading."));
      }

      setRun(payload.run);
    } catch (error) {
      setClientError(error instanceof Error ? error.message : l("Nie udało się rozpocząć pobierania.", "Could not start downloading."));
    } finally {
      setIsStarting(false);
    }
  }, [l]);

  const resetRun = useCallback(async () => {
    setIsResetting(true);
    setClientError(null);

    try {
      const response = await fetch("/api/digest-runs/reset", { method: "POST" });
      const payload = await readApiPayload<{ run?: DigestRun | null }>(response, l("Nie udało się anulować pobierania.", "Could not cancel downloading."));

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || l("Nie udało się anulować pobierania.", "Could not cancel downloading."));
      }

      setRun(payload.run ?? null);
      router.refresh();
    } catch (error) {
      setClientError(error instanceof Error ? error.message : l("Nie udało się anulować pobierania.", "Could not cancel downloading."));
    } finally {
      setIsResetting(false);
    }
  }, [l, router]);

  useEffect(() => {
    if (!active || isStarting || isResetting) {
      return;
    }

    const tabIsVisible = () => document.visibilityState === "visible";

    const refreshIfVisible = () => {
      if (!tabIsVisible()) {
        return;
      }

      void refreshRun().catch((error) => {
        setClientError(error instanceof Error ? error.message : l("Nie udało się odczytać stanu digestu.", "Could not read the digest status."));
      });
    };

    const resumeIfVisible = () => {
      if (!tabIsVisible()) {
        return;
      }

      refreshIfVisible();
      void advanceRun().catch((error) => {
        setClientError(error instanceof Error ? error.message : l("Nie udało się kontynuować pobierania.", "Could not continue downloading."));
      });
    };

    resumeIfVisible();

    const refreshTimer = window.setInterval(resumeIfVisible, ACTIVE_STATUS_REFRESH_MS);
    document.addEventListener("visibilitychange", resumeIfVisible);

    return () => {
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", resumeIfVisible);
    };
  }, [active, advanceRun, isResetting, isStarting, l, refreshRun]);

  if (!active && run?.status !== "failed") {
    const digestReady = run?.status === "succeeded";

    return (
      <section
        className="-mx-4 grid min-h-17 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-y bg-background px-4 py-3 md:mx-0 md:min-h-0 md:rounded-xl md:border md:bg-card/75 md:shadow-sm"
        aria-label={l("Pobieranie digestu", "Digest download")}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="size-2.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <p className="min-w-0 truncate text-sm text-foreground sm:text-base">
            <span className="font-medium">{storyCount ?? 0} {l("newsów", "stories")}</span>
            <span className="mx-2 text-muted-foreground" aria-hidden="true">·</span>
            <span className="text-muted-foreground">{digestReady ? l("aktualny", "up to date") : l("gotowy", "ready")}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 [&_button]:h-10 [&_button]:px-3.5">
          {retrySlot}
          <Button type="button" size="lg" className="h-10 px-3.5" onClick={startRun} disabled={isStarting}>
            {isStarting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            {l("Pobierz newsy", "Fetch news")}
          </Button>
        </div>
        {clientError ? <p className="col-span-full text-sm text-destructive">{clientError}</p> : null}
      </section>
    );
  }

  return (
    <section
      className="-mx-4 overflow-hidden border-y bg-card p-3 md:mx-0 md:rounded-2xl md:border md:p-5 md:shadow-sm"
      aria-label={l("Pobieranie digestu", "Digest download")}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start md:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Activity className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{l("Aktualizacja digestu", "Updating digest")}</h2>
            <Badge className="hidden sm:inline-flex" variant={run?.status === "failed" ? "destructive" : active ? "secondary" : "outline"}>
              {formatRunStatus(run?.status ?? null, locale)}
            </Badge>
            {run ? (
              <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {run.report_date}
              </span>
            ) : null}
          </div>

          <div className="mt-2 grid gap-2.5 md:mt-3 md:gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">
                {currentCopy ? currentCopy.verb : l("Gotowe na dziś", "Ready for today")}
              </p>
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {`${progress}% · ${completedStageCount}/${displayStages.length} ${l("etapów", "stages")}`}
              </span>
            </div>

            <div className="relative h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700"
                style={{ width: `${progress}%` }}
              />
              {active ? (
                <div className="absolute inset-y-0 w-1/3 animate-[digest-scan_1.4s_ease-in-out_infinite] bg-white/35" />
              ) : null}
            </div>

            <div className="hidden flex-wrap gap-1.5 sm:flex">
              {displayStages.map((stage) => {
                const copy = stageCopy(stage.stage_name, locale);
                const isCurrent = currentStage?.id === stage.id;
                const isDone = stage.status === "succeeded";
                const isFailed = stage.status === "failed";

                return (
                  <div
                    key={stage.id}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background/70 px-2.5 transition-colors",
                      isCurrent && active && "border-primary/50 bg-accent",
                      isDone && "border-primary/20",
                      isFailed && "border-destructive/30 bg-destructive/5",
                    )}
                  >
                    {isFailed ? (
                      <X className="size-3.5 text-destructive" aria-hidden="true" />
                    ) : isDone ? (
                      <Check className="size-3.5 text-primary" aria-hidden="true" />
                    ) : isCurrent && active ? (
                      <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden="true" />
                    ) : (
                      <Circle className="size-3 text-muted-foreground/50" aria-hidden="true" />
                    )}
                    <span className="text-xs font-medium">{copy.label}</span>
                  </div>
                );
              })}
            </div>

            {visibleError ? (
              <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {visibleError}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {run?.status === "failed" ? (
            <>
              {retrySlot}
              <Button type="button" size="lg" variant="outline" onClick={resetRun} disabled={isResetting}>
                {isResetting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                {l("Wyczyść błąd", "Clear error")}
              </Button>
            </>
          ) : active ? (
            <>
              <div className="hidden h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium text-muted-foreground sm:inline-flex">
                <Sparkles className="size-4 animate-pulse text-primary" aria-hidden="true" />
                {l("Pobieranie", "Downloading")}
              </div>
              <Button type="button" size="sm" variant="outline" onClick={resetRun} disabled={isResetting}>
                {isResetting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                {l("Anuluj pobieranie", "Cancel download")}
              </Button>
            </>
          ) : (
            <Button type="button" size="lg" onClick={startRun} disabled={isStarting}>
              {isStarting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
              {l("Pobierz newsy", "Fetch news")}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
