from __future__ import annotations

from .celery_app import celery_app


@celery_app.task(name="fm.echo")
def echo(message: str) -> dict:
    return {"echo": message}


@celery_app.task(name="fm.publish_preview_zip", bind=True)
def publish_preview_zip(self, zip_b64: str, bucket: str, prefix: str, artifact_id: str) -> dict:
    import base64
    from datetime import datetime, timezone

    from .publish import upload_zip_to_prefix
    from .db import update_artifact_metadata

    started_at = datetime.now(timezone.utc).isoformat()

    update_artifact_metadata(artifact_id, {
        "state": "STARTED",
        "started_at": started_at,
        "celery_task_id": self.request.id,
        "bucket": bucket,
        "prefix": prefix,
    })

    try:
        zip_bytes = base64.b64decode(zip_b64.encode("utf-8"))
        res = upload_zip_to_prefix(zip_bytes, bucket=bucket, prefix=prefix)

        finished_at = datetime.now(timezone.utc).isoformat()
        update_artifact_metadata(artifact_id, {
            "state": "SUCCESS",
            "finished_at": finished_at,
            "uploaded": res.get("uploaded", 0),
        })
        return {"ok": True, **res}

    except Exception as e:
        finished_at = datetime.now(timezone.utc).isoformat()
        update_artifact_metadata(artifact_id, {
            "state": "FAILURE",
            "finished_at": finished_at,
            "error": str(e),
        })
        raise


# ----------------------------
# Generic runner
# ----------------------------

@celery_app.task(name="fm.run_task", bind=True)
def run_task(self, company_code: str, task_id: str) -> dict:
    """
    Generic runner:
    - Reads tasks.runtime_json.job_type + job_payload
    - Uses control_json.pause/cancel
    - Writes tasks.status using DB enum values
    """
    import psycopg
    from datetime import datetime, timezone

    from .db import _sync_dsn, get_task_control

    dsn = _sync_dsn()

    def fetch_runtime() -> dict:
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT COALESCE(t.runtime_json,'{}'::jsonb)
                    FROM tasks t
                    JOIN companies c ON c.id=t.company_id
                    WHERE c.code=%s AND t.id=%s::uuid
                    LIMIT 1
                    """,
                    (company_code, task_id),
                )
                row = cur.fetchone()
                return row[0] if row else {}

    def set_status(new_status: str, patch_runtime: dict | None = None, last_error: str | None = None) -> None:
        patch_runtime = patch_runtime or {}
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE tasks t
                    SET status=%s,
                        last_heartbeat_at = now(),
                        last_error = COALESCE(%s, t.last_error),
                        runtime_json = COALESCE(t.runtime_json,'{}'::jsonb)
                          || %s::jsonb
                          || jsonb_build_object('celery_task_id', to_jsonb(CAST(%s AS text)))
                    FROM companies c
                    WHERE c.id=t.company_id AND c.code=%s AND t.id=%s::uuid
                    """,
                    (
                        new_status,
                        last_error,
                        psycopg.types.json.Json(patch_runtime),
                        self.request.id,
                        company_code,
                        task_id,
                    ),
                )
            conn.commit()

    started_at = datetime.now(timezone.utc).isoformat()

    runtime = fetch_runtime()
    job_type = runtime.get("job_type")
    job_payload = runtime.get("job_payload") or {}

    # start
    set_status("running", patch_runtime={"started_at": started_at, "job_type": job_type})

    try:
        if job_type == "long_demo":
            seconds = int(job_payload.get("seconds", 60))
            return _handle_long_demo(
                company_code=company_code,
                task_id=task_id,
                seconds=seconds,
                started_at=started_at,
                dsn=dsn,
                set_status=set_status,
                get_task_control=get_task_control,
            )

        # TODO: ajoute tes vrais handlers ici (publish, runner IA, etc.)
        raise ValueError(f"Unknown job_type={job_type!r}")

    except Exception as e:
        set_status("failed", patch_runtime={"finished_at": datetime.now(timezone.utc).isoformat()}, last_error=str(e))
        raise


def _handle_long_demo(
    company_code: str,
    task_id: str,
    seconds: int,
    started_at: str,
    dsn: str,
    set_status,
    get_task_control,
) -> dict:
    import time
    import psycopg

    elapsed = 0
    was_paused = False

    while elapsed < seconds:
        ctl = get_task_control(company_code, task_id) or {}

        if ctl.get("cancel") is True:
            set_status("canceled", patch_runtime={"finished_at": _utc_iso()})
            return {"ok": False, "state": "CANCELED", "elapsed": elapsed, "started_at": started_at}

        if ctl.get("pause") is True:
            if not was_paused:
                set_status("paused")
                was_paused = True
            time.sleep(1)
            continue
        else:
            if was_paused:
                set_status("running")
                was_paused = False

        time.sleep(1)
        elapsed += 1

        if elapsed % 5 == 0:
            with psycopg.connect(dsn) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE tasks t
                        SET last_heartbeat_at = now()
                        FROM companies c
                        WHERE c.id=t.company_id AND c.code=%s AND t.id=%s::uuid
                        """,
                        (company_code, task_id),
                    )
                conn.commit()

    set_status("done", patch_runtime={"finished_at": _utc_iso()})
    return {"ok": True, "state": "DONE", "elapsed": elapsed, "started_at": started_at}


def _utc_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
