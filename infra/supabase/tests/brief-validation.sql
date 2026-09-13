-- Run only in an empty, disposable PostgreSQL database with psql -v ON_ERROR_STOP=1.
begin;
create role anon;
create role authenticated;
create role service_role;
create table public.pipeline_stage_runs(digest_run_id uuid, stage_name text, status text, lease_token uuid);
create table public.digest_brief_jobs(digest_run_id uuid primary key, status text, generation_attempt_count integer, retry_cycle integer);
\ir ../migrations/20260913150203_brief_validation_report.sql
insert into public.pipeline_stage_runs values ('00000000-0000-0000-0000-000000000001','ai_brief','running','00000000-0000-0000-0000-000000000002');
insert into public.digest_brief_jobs(digest_run_id,status,generation_attempt_count,retry_cycle) values ('00000000-0000-0000-0000-000000000001','generating',1,0);
do $$
declare run_id uuid := '00000000-0000-0000-0000-000000000001'; lease uuid := '00000000-0000-0000-0000-000000000002';
begin
  assert not public.save_digest_brief_validation(run_id,run_id,1,'{"valid":false}'::jsonb), 'stale lease must fail';
  assert not public.save_digest_brief_validation(run_id,lease,2,'{"valid":false}'::jsonb), 'wrong attempt must fail';
  assert public.save_digest_brief_validation(run_id,lease,1,'{"valid":false,"hardErrors":["invalid source"]}'::jsonb), 'rejection must persist';
  assert (select validation_report->'hardErrors'->>0 = 'invalid source' from public.digest_brief_jobs), 'reason must survive';
  update public.digest_brief_jobs set generation_attempt_count=2;
  assert public.save_digest_brief_validation(run_id,lease,2,'{"valid":true,"warnings":["short lead"]}'::jsonb), 'warnings must persist';
  assert (select jsonb_array_length(validation_history)=2 from public.digest_brief_jobs), 'retry must retain rejection history';
  assert not has_function_privilege('anon','public.save_digest_brief_validation(uuid,uuid,integer,jsonb)','EXECUTE');
  assert not has_function_privilege('authenticated','public.save_digest_brief_validation(uuid,uuid,integer,jsonb)','EXECUTE');
end $$;
rollback;
