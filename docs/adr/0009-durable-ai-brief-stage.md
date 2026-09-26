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
