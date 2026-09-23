# Daily News Digest

Daily News Digest is a private Vercel-hosted news reader. It fetches configured RSS/Atom sources, builds a staged digest pipeline, stores state in Supabase, and shows a personalized reader feed behind Supabase Auth.

## Architecture

```text
Vercel Cron -> /api/digest-runs/advance -> Supabase digest state
Reader UI -> reader/API routes -> Supabase feed and preference data
RSS/Atom sources -> staged TypeScript pipeline -> durable, ranked news_items
```

The active runtime is:

- `apps/reader`: Next.js App Router reader and API routes.
- `infra/supabase/migrations`: Supabase schema, RLS, indexes, and hosted pipeline tables.
- `config/rss-sources.json`: bootstrap RSS source list.
- `vercel.json`: Vercel build settings and cron schedule.

`news_items` are durable Story Cluster projections retained for 90 days, while saved items remain until unsaved. Pipeline state remains in `articles`, `story_clusters`, `story_updates`, `digest_runs`, and stage tables.

Reader notes keep quoted source context, personal comments, and research status. Notes and their linked Reader Items are retained until the notes are removed.

The hosted database runs `digest-data-maintenance` daily at 03:10 UTC. Its installation SQL is in `infra/supabase/install-digest-maintenance.sql`. Each run deletes at most 5,000 rows per table: temporary stage rows from successful digest runs older than one day (or cancelled runs older than seven days), unsaved and unnoted Reader Items older than 90 days, feed events older than 180 days, and cron logs older than seven days. The digest run, frozen briefing input, saved items, and notes are preserved. PostgreSQL autovacuum makes deleted space reusable; the reported database file size may not shrink immediately.

## Recommendation And Source Automation

The current implementation includes:

- visible-card Exposure tracking with versioned Recommendation Decisions;
- stable source identity and contribution attribution;
- a frozen Source Portfolio per digest run with advisory and opt-in automatic modes;
- versioned recommendation policies with shadow evaluation and rollback to version one;
- explicit and behavioral Preference Signals for topics, entities, sources, repetition, and quality;
- safe RSS/Atom discovery from websites, article URLs, or direct feed URLs;
- operator controls for source suggestions, probes, blocking, and automation.

### Safety And Activation Rules

- Hard quality and eligibility rules take precedence over personalization.
- Bulk and automatic state changes do not train preferences.
- Missing interaction is not treated as negative feedback.
- Source Portfolio decisions are immutable for a digest run and reused on retry.
- Automatic source changes require an explicit operator opt-in and sufficient real-run evidence.
- Recommendation policy changes remain versioned and can run in shadow mode before activation.
- Newly discovered sources start disabled in `auto` mode and enter probe evaluation before publication.

Remote source requests validate DNS results and every redirect, reject private or local destinations, pin the approved address for the connection, and enforce redirect, timeout, and response-size limits.

### Architecture Decisions

The domain language is defined in `CONTEXT.md`. Load-bearing decisions are recorded in:

- `docs/adr/0005-version-recommendation-decisions.md`;
- `docs/adr/0006-freeze-source-portfolio-per-run.md`;
- `docs/adr/0007-multi-dimensional-preference-signals.md`.

## Requirements

- Node.js `22.x`
- pnpm `>=10.30.1`
- Supabase project with Auth enabled
- Vercel project connected to this GitHub repository

## Environment

Copy the example:

```bash
cp .env.example .env
```

Required variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ALLOWED_READER_EMAILS=you@example.com
INGEST_SECRET=replace-with-long-random-secret
CRON_SECRET=replace-with-long-random-cron-secret
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
DIGEST_RUN_RETENTION_LIMIT=100
DIGEST_PIPELINE_V2_ENABLED=false
NVIDIA_API_KEY=
NVIDIA_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
NVIDIA_MODEL=google/diffusiongemma-26b-a4b-it
NVIDIA_FALLBACK_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
```

Notes:

- `SUPABASE_SERVICE_ROLE_KEY`, `INGEST_SECRET`, and `CRON_SECRET` must remain server-side.
- `ALLOWED_READER_EMAILS` is a comma-separated login allowlist.
- Set `NEXT_PUBLIC_APP_URL` to the production Vercel URL after deployment.
- `DIGEST_RUN_RETENTION_LIMIT` is optional. Queued and running runs are never pruned.
- `NVIDIA_API_KEY`, `NVIDIA_API_URL`, and `NVIDIA_MODEL` enable the optional AI summaries and daily briefing. `NVIDIA_FALLBACK_MODEL` is used on the second of up to three durable publication attempts. The values shown above are the defaults.
- Keep `DIGEST_PIPELINE_V2_ENABLED=false` until the v2 migration and the single Supabase watchdog are installed. The flag affects new runs only.

## Supabase Setup

Apply migrations in numeric order:

```text
infra/supabase/migrations/001_reader_schema.sql
infra/supabase/migrations/003_harden_reader_functions.sql
infra/supabase/migrations/004_move_reader_allowlist_private.sql
infra/supabase/migrations/005_hosted_pipeline_schema.sql
infra/supabase/migrations/006_reader_digest_settings.sql
infra/supabase/migrations/007_reader_sources_and_feedback.sql
infra/supabase/migrations/008_expand_reader_source_catalog.sql
infra/supabase/migrations/009_add_digest_summaries.sql
infra/supabase/migrations/010_durable_personalized_feed.sql
infra/supabase/migrations/011_digest_quality_controls.sql
infra/supabase/migrations/012_digest_intelligence_foundation.sql
infra/supabase/migrations/013_recommendation_observability.sql
infra/supabase/migrations/014_source_identity_and_attribution.sql
infra/supabase/migrations/015_source_portfolio.sql
infra/supabase/migrations/016_reader_preference_signals.sql
infra/supabase/migrations/017_source_discovery.sql
infra/supabase/migrations/018_post_migration_advisor_fixes.sql
infra/supabase/migrations/019_reader_notes.sql
infra/supabase/migrations/20260820173904_enable_nemotron_summaries.sql
infra/supabase/migrations/20260907093203_digest_reliability_v2.sql
```

Apply all migrations before deploying the current reader code. Migration `018` contains the RLS and index optimizations required after migrations `013`–`017`.

Then:

1. Insert the reader email into `private.allowed_reader_emails`.
2. Create a Supabase Auth user for that email.
3. Add the callback URLs in Supabase Auth settings:

```text
http://127.0.0.1:3000/auth/callback
https://your-vercel-domain.vercel.app/auth/callback
```

## Local Development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev:reader
```

Or use Docker Compose:

```bash
docker compose up --build reader
```

Open `http://127.0.0.1:3000`.

## Validation

```bash
pnpm test:reader
pnpm typecheck:reader
pnpm build:reader
pnpm knip
```

The Vercel build uses:

```json
{
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm build",
  "ignoreCommand": "[ \"$VERCEL_GIT_COMMIT_REF\" != \"main\" ]"
}
```

## Vercel Deployment

1. Import the GitHub repository into Vercel.
2. Use the repository root containing `vercel.json`.
3. Set the environment variables listed above.
4. Deploy from `main`.

Pushes to non-`main` branches are ignored by Vercel.

Vercel Cron invokes:

```text
GET /api/digest-runs/advance
Authorization: Bearer $CRON_SECRET
```

The configured schedule is once daily at 06:00 UTC:

```text
0 6 * * *
```

## Operations

Start a digest from the reader UI with `Run digest`. The UI creates and observes runs; Vercel Cron advances the pipeline.

Completed digest runs are pruned automatically when a run starts or finishes. The default keeps the newest 100 completed runs.

To sanitize existing stored text after changing HTML cleanup logic:

```bash
pnpm --dir apps/reader cleanup:text
```

Run cleanup commands only against the intended Supabase project.

### Digest v2 recovery and rollback

Enable `pg_cron`, `pg_net`, and Vault, store `CRON_SECRET` in Vault, then run `infra/supabase/install-digest-watchdog.sql` with the production application URL and Vault secret name. Verify the `digest-stage-watchdog-v2` row and its HTTP responses before enabling v2. Manual AI retry preserves the frozen input and requeues only `ai_brief` plus finalization.

Rollback by disabling creation of new v2 runs. Keep the compatible worker and watchdog running until existing v2 runs are terminal; do not drop the additive schema. Cleanup can be disabled independently.
