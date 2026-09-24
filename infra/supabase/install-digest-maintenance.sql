-- Install on the hosted database after enabling pg_cron. Safe to run again.
-- Each invocation removes at most 5,000 rows from each table. Deleted rows
-- themselves are the checkpoint, so a later invocation resumes the backlog.
create or replace function private.cleanup_digest_maintenance(p_batch_size integer default 5000)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source_items integer;
  v_story_snapshots integer;
  v_enrichment_records integer;
  v_news_items integer;
  v_feed_events integer;
  v_cron_logs integer;
begin
  if p_batch_size < 1 or p_batch_size > 5000 then
    raise exception 'p_batch_size must be between 1 and 5000';
  end if;

  with targets as (
    select item.id
    from public.source_items item
    join public.digest_runs run on run.id = item.digest_run_id
    where (run.status = 'succeeded' and run.finished_at < now() - interval '1 day')
       or (run.status = 'cancelled' and run.finished_at < now() - interval '7 days')
    order by item.created_at, item.id
    limit p_batch_size
  )
  delete from public.source_items item using targets where item.id = targets.id;
  get diagnostics v_source_items = row_count;

  with targets as (
    select snapshot.id
    from public.story_snapshots snapshot
    join public.digest_runs run on run.id = snapshot.digest_run_id
    where (run.status = 'succeeded' and run.finished_at < now() - interval '1 day')
       or (run.status = 'cancelled' and run.finished_at < now() - interval '7 days')
    order by snapshot.created_at, snapshot.id
    limit p_batch_size
  )
  delete from public.story_snapshots snapshot using targets where snapshot.id = targets.id;
  get diagnostics v_story_snapshots = row_count;

  with targets as (
    select record.id
    from public.enrichment_records record
    join public.digest_runs run on run.id = record.digest_run_id
    where (run.status = 'succeeded' and run.finished_at < now() - interval '1 day')
       or (run.status = 'cancelled' and run.finished_at < now() - interval '7 days')
    order by record.created_at, record.id
    limit p_batch_size
  )
  delete from public.enrichment_records record using targets where record.id = targets.id;
  get diagnostics v_enrichment_records = row_count;

  with targets as (
    select item.id
    from public.news_items item
    where item.last_selected_at < now() - interval '90 days'
      and not exists (
        select 1 from public.reader_item_states state
        where state.news_item_id = item.id and state.saved_at is not null
      )
      and not exists (
        select 1 from public.reader_notes note where note.news_item_id = item.id
      )
    order by item.last_selected_at, item.id
    limit p_batch_size
  )
  delete from public.news_items item using targets where item.id = targets.id;
  get diagnostics v_news_items = row_count;

  with targets as (
    select event.id
    from public.reader_feed_events event
    where event.created_at < now() - interval '180 days'
    order by event.created_at, event.id
    limit p_batch_size
  )
  delete from public.reader_feed_events event using targets where event.id = targets.id;
  get diagnostics v_feed_events = row_count;

  with targets as (
    select log.ctid
    from cron.job_run_details log
    where log.end_time < now() - interval '7 days'
    order by log.end_time, log.runid
    limit p_batch_size
  )
  delete from cron.job_run_details log using targets where log.ctid = targets.ctid;
  get diagnostics v_cron_logs = row_count;

  return jsonb_build_object(
    'source_items', v_source_items,
    'story_snapshots', v_story_snapshots,
    'enrichment_records', v_enrichment_records,
    'news_items', v_news_items,
    'reader_feed_events', v_feed_events,
    'cron_job_run_details', v_cron_logs
  );
end;
$$;

revoke all on function private.cleanup_digest_maintenance(integer) from public, anon, authenticated;

select cron.schedule(
  'digest-data-maintenance',
  '10 3 * * *',
  'select private.cleanup_digest_maintenance()'
);
