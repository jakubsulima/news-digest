-- Recover interrupted AI work and keep all state transitions fenced and atomic.
-- Existing function signatures and service-role-only grants are preserved.
begin;

create or replace function public.claim_next_digest_stage(p_run_id uuid, p_lease_seconds integer default 150)
returns public.pipeline_stage_runs
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_run public.digest_runs; v_stage public.pipeline_stage_runs; v_expected text[]; v_name text; v_row public.pipeline_stage_runs;
begin
  select * into v_run from public.digest_runs where id=p_run_id and status in ('queued','running') for update;
  if not found then return null; end if;
  v_expected := case when coalesce((v_run.metadata->>'pipelineVersion')::int,1)=2 then array['source_fetch','article_normalization','story_clustering','enrichment','editorial_scoring','reader_publication','ai_brief','finalization'] else array['source_fetch','article_normalization','story_clustering','enrichment','editorial_scoring','reader_publication','finalization'] end;
  if (select count(*) from public.pipeline_stage_runs where digest_run_id=p_run_id) <> cardinality(v_expected) then raise exception 'incomplete_stage_set'; end if;
  foreach v_name in array v_expected loop
    select * into v_row from public.pipeline_stage_runs where digest_run_id=p_run_id and stage_name=v_name for update;
    if not found then raise exception 'missing_stage:%',v_name; end if;
    if v_row.status in ('succeeded','skipped') then continue; end if;
    if v_row.status='failed' then raise exception 'failed_predecessor:%',v_name; end if;
    if v_row.status='running' and v_row.lease_expires_at > now() then return null; end if;
    if v_row.status='queued' and v_row.next_attempt_at > now() then return null; end if;
    update public.pipeline_stage_runs set status='running',attempt_count=attempt_count+1,started_at=now(),finished_at=null,error_message=null,next_attempt_at=null,lease_token=gen_random_uuid(),lease_expires_at=now()+make_interval(secs=>p_lease_seconds)
      where id=v_row.id returning * into v_stage;
    -- A killed worker leaves its job generating. Only the new lease owner can
    -- reset it, while the stage lock excludes all writes from the old owner.
    if v_name='ai_brief' then
      update public.digest_brief_jobs set status='retry_wait',
        infrastructure_attempt_count=infrastructure_attempt_count+1
      where digest_run_id=p_run_id and status='generating';
    end if;
    update public.digest_runs set status='running',started_at=coalesce(started_at,now()) where id=p_run_id;
    return v_stage;
  end loop;
  update public.digest_runs set status='succeeded',finished_at=coalesce(finished_at,now()),error_message=null where id=p_run_id;
  return null;
end $$;

create or replace function public.finish_digest_stage(p_stage_id uuid,p_lease_token uuid,p_status text,p_metrics jsonb default '{}'::jsonb,p_error text default null,p_next_attempt_at timestamptz default null)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_run_id uuid; v_stage public.pipeline_stage_runs;
begin
  if p_status not in ('queued','succeeded','failed','skipped') then raise exception 'invalid_terminal_stage_status'; end if;
  select digest_run_id into v_run_id from public.pipeline_stage_runs where id=p_stage_id;
  -- All multi-row writers lock run -> stage -> job to avoid deadlocks.
  perform 1 from public.digest_runs where id=v_run_id and status in ('queued','running') for update;
  if not found then return false; end if;
  select * into v_stage from public.pipeline_stage_runs where id=p_stage_id and status='running'
    and lease_token=p_lease_token and lease_expires_at>now() for update;
  if not found then return false; end if;
  update public.pipeline_stage_runs set status=p_status,metrics=coalesce(p_metrics,'{}'),error_message=p_error,next_attempt_at=p_next_attempt_at,
    finished_at=case when p_status in ('succeeded','failed','skipped') then now() else null end,
    started_at=case when p_status='queued' then null else started_at end,lease_token=null,lease_expires_at=null where id=p_stage_id;
  if v_stage.stage_name='ai_brief' then
    update public.digest_brief_jobs set
      status=case when p_status='failed' then 'failed' when p_status='queued' and status='generating' then 'retry_wait' else status end,
      last_error_code=coalesce(p_metrics->>'lastErrorCode',last_error_code),
      reason=coalesce(p_metrics->>'lastErrorCode',reason),
      infrastructure_attempt_count=infrastructure_attempt_count+case when p_metrics->>'infrastructureRetry'='true' then 1 else 0 end
    where digest_run_id=v_run_id;
  end if;
  if p_status='failed' then
    update public.digest_runs set status='failed',finished_at=now(),error_message=p_error where id=v_run_id;
  elsif v_stage.stage_name='finalization' and p_status='succeeded' then
    update public.digest_runs set status='succeeded',finished_at=now(),error_message=null where id=v_run_id;
  end if;
  return true;
end $$;

create or replace function public.start_digest_brief_attempt(p_run_id uuid,p_lease_token uuid)
returns public.digest_brief_jobs language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_job public.digest_brief_jobs;
begin
  perform 1 from public.pipeline_stage_runs where digest_run_id=p_run_id and stage_name='ai_brief' and status='running' and lease_token=p_lease_token and lease_expires_at>now() for update;
  if not found then raise exception 'lease_lost'; end if;
  update public.digest_brief_jobs set status='generating',generation_attempt_count=generation_attempt_count+1,last_error_code=null where digest_run_id=p_run_id and status in ('pending','retry_wait') and generation_attempt_count<3 returning * into v_job;
  if v_job.digest_run_id is null then raise exception 'job_not_ready'; end if;
  return v_job;
end $$;

create or replace function public.save_digest_brief_validation(p_run_id uuid, p_lease_token uuid, p_attempt integer, p_report jsonb)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  perform 1 from public.pipeline_stage_runs where digest_run_id=p_run_id and stage_name='ai_brief'
    and status='running' and lease_token=p_lease_token and lease_expires_at>now() for update;
  if not found then return false; end if;
  update public.digest_brief_jobs set validation_report=p_report,
    validation_history=validation_history || jsonb_build_array(p_report || jsonb_build_object('retryCycle', retry_cycle))
    where digest_run_id=p_run_id and status='generating' and generation_attempt_count=p_attempt;
  return found;
end $$;

create or replace function public.save_digest_brief_candidate(p_run_id uuid,p_lease_token uuid,p_candidate jsonb,p_model text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  perform 1 from public.pipeline_stage_runs where digest_run_id=p_run_id and stage_name='ai_brief'
    and status='running' and lease_token=p_lease_token and lease_expires_at>now() for update;
  if not found then return false; end if;
  update public.digest_brief_jobs set candidate_payload=p_candidate,model=p_model,status='generated'
    where digest_run_id=p_run_id and status='generating' and validation_report->>'valid'='true'
      and (validation_report->>'attempt')::integer=generation_attempt_count;
  return found;
end $$;

create or replace function public.commit_digest_brief(p_run_id uuid,p_lease_token uuid,p_summary jsonb,p_kind text,p_reason text default null)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare j public.digest_brief_jobs; r public.digest_runs;
begin
  select * into r from public.digest_runs where id=p_run_id and status in ('queued','running') for update;
  if r.id is null then return false; end if;
  perform 1 from public.pipeline_stage_runs where digest_run_id=p_run_id and stage_name='ai_brief'
    and status='running' and lease_token=p_lease_token and lease_expires_at>now() for update;
  if not found then return false; end if;
  select * into j from public.digest_brief_jobs where digest_run_id=p_run_id for update;
  if not found or p_kind not in ('ai','fallback') then return false; end if;
  if p_kind='ai' and (j.candidate_payload is null or j.candidate_payload<>p_summary
    or coalesce(j.validation_report->>'valid','false')<>'true') then return false; end if;
  if p_kind='fallback' and j.candidate_payload is not null and j.validation_report->>'valid'='true' then return false; end if;
  insert into public.digest_summaries(digest_run_id,digest_date,summary,highlights,sections,watchlist,coverage_note,reading_time_minutes,generation_kind,generation_reason,model,prompt_version,input_hash)
  values(p_run_id,r.report_date,p_summary->>'summary',coalesce(p_summary->'highlights','[]'),coalesce(p_summary->'sections','[]'),coalesce(p_summary->'watchlist','[]'),coalesce(p_summary->>'coverageNote',''),coalesce((p_summary->>'readingTimeMinutes')::int,1),p_kind,p_reason,j.model,j.prompt_version,j.input_hash)
  on conflict(digest_run_id) do update set summary=excluded.summary,highlights=excluded.highlights,sections=excluded.sections,watchlist=excluded.watchlist,coverage_note=excluded.coverage_note,reading_time_minutes=excluded.reading_time_minutes,generation_kind=excluded.generation_kind,generation_reason=excluded.generation_reason,model=excluded.model,prompt_version=excluded.prompt_version,input_hash=excluded.input_hash;
  update public.digest_brief_jobs set status=case when p_kind='ai' then 'generated' else case when p_reason in ('disabled','insufficient_evidence','no_articles') then 'skipped' else 'fallback' end end,reason=p_reason,completed_at=now() where digest_run_id=p_run_id;
  update public.pipeline_stage_runs set status='succeeded',finished_at=now(),lease_token=null,lease_expires_at=null where digest_run_id=p_run_id and stage_name='ai_brief' and lease_token=p_lease_token;
  return found;
end $$;

create or replace function public.retry_digest_brief(p_run_id uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_job public.digest_brief_jobs;
begin
  if exists(select 1 from public.digest_runs where id<>p_run_id and status in ('queued','running')) then raise exception 'another_active_digest_run'; end if;
  perform 1 from public.digest_runs where id=p_run_id for update;
  if not found then return false; end if;
  perform 1 from public.pipeline_stage_runs where digest_run_id=p_run_id order by id for update;
  select * into v_job from public.digest_brief_jobs where digest_run_id=p_run_id for update;
  if not found or v_job.status not in ('fallback','failed','skipped') then return false; end if;
  update public.digest_runs set status='queued',finished_at=null,error_message=null where id=p_run_id;
  update public.digest_brief_jobs set retry_cycle=retry_cycle+1,generation_attempt_count=0,infrastructure_attempt_count=0,status='pending',reason=null,last_error_code=null,completed_at=null where digest_run_id=p_run_id;
  update public.pipeline_stage_runs set status=case when stage_name in ('ai_brief','finalization') then 'queued' else status end,attempt_count=0,started_at=null,finished_at=null,error_message=null,next_attempt_at=null,lease_token=null,lease_expires_at=null where digest_run_id=p_run_id and stage_name in ('ai_brief','finalization');
  return true;
end $$;

commit;
