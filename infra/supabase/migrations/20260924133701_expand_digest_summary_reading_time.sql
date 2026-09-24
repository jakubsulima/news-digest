-- Full Luna briefings can take longer than the previous five-minute limit.
-- Keep the same range as digest_summary_localizations.reading_time_minutes.
ALTER TABLE public.digest_summaries
  DROP CONSTRAINT IF EXISTS digest_summaries_reading_time_range,
  ADD CONSTRAINT digest_summaries_reading_time_range
    CHECK (reading_time_minutes BETWEEN 1 AND 60);
