-- Run after brief-recovery-setup.sql in a disposable database.
begin;
do $$
declare r public.digest_runs; s public.pipeline_stage_runs; old_token uuid; j public.digest_brief_jobs;
begin
  r := public.create_or_get_digest_run_v2(null,current_date,true);
  update pipeline_stage_runs set status='succeeded' where digest_run_id=r.id and stage_name not in ('ai_brief','finalization');
  insert into digest_brief_jobs(digest_run_id,input_payload,input_hash,prompt_version,status) values(r.id,'{}','test','test','pending');
  s := public.claim_next_digest_stage(r.id,150);
  j := public.start_digest_brief_attempt(r.id,s.lease_token);
  assert j.generation_attempt_count=1;
  old_token := s.lease_token;
  update pipeline_stage_runs set lease_expires_at=now()-interval '1 second' where id=s.id;
  s := public.claim_next_digest_stage(r.id,150);
  assert s.lease_token<>old_token;
  j := public.start_digest_brief_attempt(r.id,s.lease_token);
  assert j.generation_attempt_count=2, 'abandoned generating job must be claimable again';
  assert not public.finish_digest_stage(s.id,old_token,'failed'), 'old worker must be fenced out';
  assert not public.save_digest_brief_candidate(r.id,s.lease_token,'{"summary":"unchecked"}','model'), 'unvalidated candidate must be rejected';
  assert public.save_digest_brief_validation(r.id,s.lease_token,2,'{"valid":true,"attempt":2}');
  assert public.save_digest_brief_candidate(r.id,s.lease_token,'{"summary":"validated","readingTimeMinutes":3}','model');
  assert public.finish_digest_stage(s.id,s.lease_token,'queued','{"infrastructureRetry":true}','checkpoint network failure',now());
  assert (select candidate_payload->>'summary'='validated' from digest_brief_jobs where digest_run_id=r.id), 'candidate survives retry';
  s := public.claim_next_digest_stage(r.id,150);
  assert not public.commit_digest_brief(r.id,s.lease_token,'{"summary":"different"}','ai'), 'commit must match the validated candidate';
  assert public.commit_digest_brief(r.id,s.lease_token,'{"summary":"validated","readingTimeMinutes":3}','ai');
  assert (select generation_kind='ai' and summary='validated' from digest_summaries where digest_run_id=r.id);
  s := public.claim_next_digest_stage(r.id,150);
  assert s.stage_name='finalization';
  assert public.finish_digest_stage(s.id,s.lease_token,'succeeded');
  assert (select status='succeeded' from digest_runs where id=r.id), 'finalization must atomically complete the run';
  -- A fresh run: provider retry is a single fenced checkpoint, not two writes.
  r := public.create_or_get_digest_run_v2(null,current_date,true);
  update pipeline_stage_runs set status='succeeded' where digest_run_id=r.id and stage_name not in ('ai_brief','finalization');
  insert into digest_brief_jobs(digest_run_id,input_payload,input_hash,prompt_version,status) values(r.id,'{}','test','test','pending');
  s := public.claim_next_digest_stage(r.id,150);
  j := public.start_digest_brief_attempt(r.id,s.lease_token);
  assert public.finish_digest_stage(s.id,s.lease_token,'queued','{"lastErrorCode":"openai_timeout"}',null,now()+interval '30 seconds');
  assert (select status='retry_wait' and last_error_code='openai_timeout' from digest_brief_jobs where digest_run_id=r.id);
  s := public.claim_next_digest_stage(r.id,150);
  assert s.id is null, 'backoff must be honored';
  update pipeline_stage_runs set next_attempt_at=now() where digest_run_id=r.id;
  s := public.claim_next_digest_stage(r.id,150);
  update digest_brief_jobs set generation_attempt_count=3 where digest_run_id=r.id;
  begin
    perform public.start_digest_brief_attempt(r.id,s.lease_token);
    assert false, 'provider attempt budget must be enforced by the database';
  exception when raise_exception then
    assert sqlerrm='job_not_ready';
  end;
  assert public.finish_digest_stage(s.id,s.lease_token,'failed','{}','permanent error');
  assert (select status='failed' from digest_runs where id=r.id), 'failure must atomically finalize the run';
  assert public.retry_digest_brief(r.id);
  assert (select attempt_count=0 from pipeline_stage_runs where digest_run_id=r.id and stage_name='ai_brief');
  -- Legacy crash after every stage succeeded must not leave an active run forever.
  update pipeline_stage_runs set status='succeeded' where digest_run_id=r.id;
  s := public.claim_next_digest_stage(r.id,150);
  assert s.id is null;
  assert (select status='succeeded' from digest_runs where id=r.id);
  assert not has_function_privilege('anon','public.save_digest_brief_candidate(uuid,uuid,jsonb,text)','execute');
  assert not has_function_privilege('authenticated','public.finish_digest_stage(uuid,uuid,text,jsonb,text,timestamptz)','execute');
end $$;
rollback;
