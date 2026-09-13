alter table public.digest_brief_jobs add column if not exists validation_report jsonb;
alter table public.digest_brief_jobs add column if not exists validation_history jsonb not null default '[]'::jsonb;

create or replace function public.save_digest_brief_validation(p_run_id uuid, p_lease_token uuid, p_attempt integer, p_report jsonb)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  perform 1 from public.pipeline_stage_runs where digest_run_id=p_run_id and stage_name='ai_brief'
    and status='running' and lease_token=p_lease_token for update;
  if not found then return false; end if;
  update public.digest_brief_jobs set validation_report=p_report,
    validation_history=validation_history || jsonb_build_array(p_report || jsonb_build_object('retryCycle', retry_cycle))
    where digest_run_id=p_run_id and status='generating' and generation_attempt_count=p_attempt;
  return found;
end $$;
revoke execute on function public.save_digest_brief_validation(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_digest_brief_validation(uuid,uuid,integer,jsonb) to service_role;
