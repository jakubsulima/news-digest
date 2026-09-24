export type DigestBriefTextParagraph = {
  text: string;
};

export type DigestBriefTextSection = {
  paragraphs: DigestBriefTextParagraph[];
};

export type DigestBriefTextWatchItem = {
  signal: string;
  why: string;
};

export function wordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

export function digestBriefWordCount({
  coverageNote,
  sections,
  summary,
  watchlist,
}: {
  coverageNote: string;
  sections: DigestBriefTextSection[];
  summary: string;
  watchlist: DigestBriefTextWatchItem[];
}) {
  return wordCount(
    [
      summary,
      ...sections.flatMap((section) => section.paragraphs.map((paragraph) => paragraph.text)),
      ...watchlist.flatMap((item) => [item.signal, item.why]),
      coverageNote,
    ].join(" "),
  );
}

export function readingTimeMinutesForDigestBrief(input: Parameters<typeof digestBriefWordCount>[0]) {
  return Math.max(1, Math.ceil(digestBriefWordCount(input) / 180));
}
