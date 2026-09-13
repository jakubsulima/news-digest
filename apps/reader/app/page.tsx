import { RotateCcw } from "lucide-react";

import { AppNavbar } from "@/components/app-navbar";
import { Button } from "@/components/ui/button";
import { DigestRunPanel } from "@/components/digest-run-panel";
import { DigestBriefCard } from "@/components/digest-brief";
import { retryAiDigestBrief, retryDigestRun } from "@/lib/actions";
import { requireCurrentReader } from "@/lib/auth";
import { getDigestRunStatus } from "@/lib/digest-runs";
import { fallbackDigestBriefFromNews, getLatestDigestBrief } from "@/lib/digest-brief";
import { getReaderFeedPage } from "@/lib/reader-feed";
import { localeTag, localize } from "@/lib/reader-locale";
import { getReaderLocale } from "@/lib/reader-locale-server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function signOut() {
  "use server";

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}

export default async function HomePage() {
  const user = await requireCurrentReader();
  const [digestRun, digestBrief, feedPage, locale] = await Promise.all([
    getDigestRunStatus(),
    getLatestDigestBrief(),
    getReaderFeedPage(user.id, {
      feed: "all",
      period: "latest",
      sort: "for-you",
      view: "all",
    }),
    getReaderLocale(),
  ]);
  const allInitialItems = Object.values(feedPage.grouped).flat();
  const interactionsByNewsItemId = Object.fromEntries(
    allInitialItems.map((item) => [item.id, {
      feedback: item.feedback,
      feedbackReason: item.feedbackReason,
      noteCount: item.noteCount,
    }]),
  );
  const brief = digestBrief || fallbackDigestBriefFromNews(
    allInitialItems,
  );
  const digestDateLabel = brief
    ? new Intl.DateTimeFormat(localeTag(locale), {
        day: "numeric",
        month: "long",
        timeZone: "Europe/Warsaw",
        year: "numeric",
      }).format(new Date(`${brief.digestDate}T12:00:00Z`))
    : localize(locale, "Dzisiaj", "Today");

  return (
    <>
      <AppNavbar email={user.email || "Reader"} mobileContext={digestDateLabel} signOut={signOut} />
      <main
        id="page-top"
        className="mx-auto flex w-full max-w-4xl scroll-mt-20 flex-col gap-0 px-4 md:gap-4 md:px-6 md:py-6"
      >
        <DigestRunPanel
          initialRun={digestRun}
          storyCount={feedPage.totalCount}
          retrySlot={
            digestRun?.status === "failed" ? (
              <form action={retryDigestRun.bind(null, digestRun.id)}>
                <Button type="submit" size="lg" title={localize(locale, "Ponów nieudany etap", "Retry failed stage")}>
                  <RotateCcw aria-hidden="true" />
                  {localize(locale, "Ponów etap", "Retry stage")}
                </Button>
              </form>
            ) : digestRun?.status === "succeeded" && ["fallback", "skipped", "failed"].includes(digestRun.briefJob?.status || "") ? (
              <form action={retryAiDigestBrief.bind(null, digestRun.id)}>
                <Button type="submit" size="lg" title={localize(locale, "Ponów tylko podsumowanie AI", "Retry only the AI briefing")}>
                  <RotateCcw aria-hidden="true" />
                  {localize(locale, "Ponów AI", "Retry AI")}
                </Button>
              </form>
            ) : null
          }
        />
        {brief ? <DigestBriefCard brief={brief} canRetryAi={digestRun?.id === brief.digestRunId && digestRun?.status === "succeeded" && ["fallback", "skipped", "failed"].includes(digestRun.briefJob?.status || "")} interactionsByNewsItemId={interactionsByNewsItemId} /> : null}
      </main>
    </>
  );
}
