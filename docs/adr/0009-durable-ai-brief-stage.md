# ADR-0009: Durable AI briefing stage

## Status

Accepted.

## Decision

Pipeline v2 adds `ai_brief` between reader publication and finalization. Publication freezes a bounded, canonically hashed input and writes a usable fallback before completing. AI work is claimed with a 150-second lease, performs at most one provider request per worker invocation, checkpoints a valid candidate, and commits candidate, summary, job state, and stage state transactionally.

Retries use the frozen input. A Supabase Cron watchdog signals the worker every minute through `pg_net`; the browser is only an observer. Delivery is at-least-once, while writes are idempotent and fenced by lease tokens. Existing v1 runs retain their original stage list.

## Consequences

- publishing news is independent of provider availability;
- a crash may repeat an external AI call, so exactly-once generation is not claimed;
- v2 activation is gated by `DIGEST_PIPELINE_V2_ENABLED` and requires the migration and watchdog first;
- cleanup is not part of v2 availability and runs separately.


## Recovery hardening (2026-09-26)

Reclaiming an expired AI lease requeues an abandoned `generating` job. Retrying a provider attempt checkpoints the job and stage in one fenced database transaction. A validated candidate survives infrastructure retries and is committed without another provider call. Completion/failure of a stage and the run's terminal state are atomic; stale workers cannot fail a successor's run. Multi-row transitions lock run, stage, then job consistently.

Generation remains limited to three provider requests per retry cycle, including requests interrupted by worker termination. AI infrastructure failures can requeue while the stage claim count is below six; manual retry resets that cycle. Confirmed output-token truncation increases the next response budget from 7,000 to 10,500/14,000 tokens without shortening the requested briefing or extending the worker deadline. Provider `Retry-After` delays are honored up to 15 minutes. Full-text source variants are preferred even when the canonical RSS item has only a summary. Factual, coverage, and reference validation remains required.

Regression verification uses Vitest plus a disposable PostgreSQL 17 database: `infra/supabase/tests/brief-recovery-setup.sql`, the recovery migration, then `brief-recovery.sql`. `brief-recovery-concurrency.py <container>` races eight workers before and after lease expiry. These tests must never be run against production.

## Retry activation and numeric normalization (2026-11-05)

Manual retry actions start the existing run in `after`, with the same bounded executor and continuation used for a new run. The reader panel remounts when the server's run or brief status changes, so a retry of the same run resumes polling. Neither operation refetches RSS for an AI-only retry.

Grounding compares equivalent numeric notation before rejecting a briefing: shared magnitude ranges such as `15–16 mld`, English number words such as `eight` and `thirteen`, and grouped numbers followed by punctuation. Unsupported values and changed magnitudes remain blocking errors. Production reports showed these notation differences exhausting all three generations despite supported source facts.

## Publisher attribution and dotted clock times (2026-11-13)

Runs on November 12–13 exhausted their AI attempts because grounding interpreted `France 24` attribution as an unsupported count. Numeric validation now excludes whole publisher names from cited source metadata, including the name without its English edition label, in both source text and briefing text. The publisher's digits do not authorize unrelated quantities. Clock times such as the Microsoft outage source's `3.30am GMT` normalize to `03:30`; the dotted form requires AM/PM so ordinary decimals remain quantities. Regression tests cover both production patterns through grounding and the OpenAI generation path.


## Polish clock labels and shared ranges (2026-11-15)

The November 14 briefing exhausted three generations with `time:20:16` and `1` grounding errors. Its frozen sources contain FAA's `godz. 20.16` restoration time and Nvidia stock purchases between `$1m` and `$5m`. Numeric validation now normalizes dotted Polish times after an explicit clock label and expands shared magnitudes in `między 1 a 5 mln` / `pomiędzy 1 a 5 milionów`. Regression tests reproduce the exact error signatures, exercise the provider-response validation path, and continue rejecting changed times, values, and magnitudes. Rejected provider text is not persisted, so the precise phrasing behind the `1` error cannot be recovered from the production history.

## Validation gaps and continuation cleanup (2026-11-15)

Section titles now pass the same numeric and model-price checks as paragraph text, using only the stories cited by that section. A watchlist item must cite at least one selected story; an empty watchlist remains valid. This closes paths that previously allowed unsupported statements to reach the reader even when paragraph validation succeeded.

English number normalization accepts hyphenated ages and monetary phrases such as `twenty-one-year-old` and `twenty-one-million`, without authorizing their individual number fragments or dropping their magnitude. Continuation requests clear their deadline timer in `finally`, including network and configuration failures, while retaining the five-second abort deadline. Regression tests cover rejection before each fix and the complete provider-response validation path for section titles.
