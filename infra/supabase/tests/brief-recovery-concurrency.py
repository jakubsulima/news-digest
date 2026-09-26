"""Run against the disposable container created for brief-recovery-setup.sql."""
import concurrent.futures
import subprocess
import sys

container = sys.argv[1]

def sql(query):
    return subprocess.check_output(
        ["docker", "exec", container, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", query],
        text=True,
    ).strip()

run_id = sql("select (public.create_or_get_digest_run_v2(null,current_date,true)).id")
try:
    sql(f"update pipeline_stage_runs set status='succeeded' where digest_run_id='{run_id}' and stage_name not in ('ai_brief','finalization')")
    sql(f"insert into digest_brief_jobs(digest_run_id,input_payload,input_hash,prompt_version,status) values('{run_id}','{{}}','test','test','pending')")
    def claim(_):
        return sql(f"select (public.claim_next_digest_stage('{run_id}',150)).lease_token")
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        owners = [token for token in pool.map(claim, range(8)) if token]
    assert len(owners) == 1, owners
    sql(f"select public.start_digest_brief_attempt('{run_id}','{owners[0]}')")
    sql(f"update pipeline_stage_runs set lease_expires_at=now()-interval '1 second' where digest_run_id='{run_id}' and stage_name='ai_brief'")
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        successors = [token for token in pool.map(claim, range(8)) if token]
    assert len(successors) == 1 and successors[0] != owners[0], successors
    assert sql(f"select (public.start_digest_brief_attempt('{run_id}','{successors[0]}')).generation_attempt_count") == "2"
    assert sql(f"select public.save_digest_brief_validation('{run_id}','{owners[0]}',1,'{{\"valid\":true}}')") == "f"
    print("PASS: eight concurrent claims elect one owner; crash recovery elects one successor; stale writes rejected")
finally:
    sql(f"delete from digest_brief_jobs where digest_run_id='{run_id}'")
    sql(f"delete from pipeline_stage_runs where digest_run_id='{run_id}'")
    sql(f"delete from digest_runs where id='{run_id}'")
