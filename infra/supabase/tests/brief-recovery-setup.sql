-- Disposable PostgreSQL only. Minimal tables preserve the production RPC seam.
create role anon; create role authenticated; create role service_role;
create table public.digest_runs(id uuid primary key default gen_random_uuid(), report_date date not null, trigger_type text, status text, started_by_user_id uuid, metadata jsonb default '{}', started_at timestamptz, finished_at timestamptz, error_message text, created_at timestamptz default now());
create unique index one_active_run on public.digest_runs ((true)) where status in ('queued','running');
create table public.pipeline_stage_runs(id uuid primary key default gen_random_uuid(), digest_run_id uuid references digest_runs(id), stage_name text, status text, attempt_count int default 0, started_at timestamptz, finished_at timestamptz, error_message text, metrics jsonb default '{}', created_at timestamptz default now(), unique(digest_run_id,stage_name));
create table public.digest_summaries(digest_run_id uuid primary key references digest_runs(id),digest_date date,summary text,highlights jsonb,sections jsonb,watchlist jsonb,coverage_note text,reading_time_minutes int);
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
\ir ../migrations/20260907093203_digest_reliability_v2.sql
\ir ../migrations/20260913150203_brief_validation_report.sql
