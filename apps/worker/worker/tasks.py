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

    update_artifact_metadata(
        artifact_id,
        {
            "state": "STARTED",
            "started_at": started_at,
            "celery_task_id": self.request.id,
            "bucket": bucket,
            "prefix": prefix,
        },
    )

    try:
        zip_bytes = base64.b64decode(zip_b64.encode("utf-8"))
        res = upload_zip_to_prefix(zip_bytes, bucket=bucket, prefix=prefix)

        finished_at = datetime.now(timezone.utc).isoformat()
        update_artifact_metadata(
            artifact_id,
            {
                "state": "SUCCESS",
                "finished_at": finished_at,
                "uploaded": res.get("uploaded", 0),
            },
        )
        return {"ok": True, **res}

    except Exception as e:
        finished_at = datetime.now(timezone.utc).isoformat()
        update_artifact_metadata(
            artifact_id,
            {
                "state": "FAILURE",
                "finished_at": finished_at,
                "error": str(e),
            },
        )
        raise


@celery_app.task(name="fm.long_demo", bind=True)
def long_demo(self, company_code: str, task_id: str, seconds: int = 60) -> dict:
    """
    Demo task:
    - lit control_json.pause / control_json.cancel
    - écrit tasks.status AVEC les valeurs enum DB:
        queued, running, paused, canceled, done, failed
    """
    import time
    from datetime import datetime, timezone

    import psycopg
    from .db import _sync_dsn, get_task_control

    dsn = _sync_dsn()
    started_at = datetime.now(timezone.utc).isoformat()

    def set_status(new_status: str, **runtime_extra) -> None:
        """
        Update status + heartbeat + runtime_json minimal (celery_task_id + timestamps).
        """
        runtime_extra = runtime_extra or {}
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE tasks t
                    SET status = %s,
                        last_heartbeat_at = now(),
                        runtime_json = COALESCE(runtime_json,'{}'::jsonb)
                          || jsonb_build_object(
                                'celery_task_id', to_jsonb(CAST(%s AS text)),
                                'worker_started_at', COALESCE(runtime_json->>'worker_started_at', %s),
                                'worker_last_heartbeat_at', %s
                             )
                          || COALESCE(%s::jsonb, '{}'::jsonb)
                    FROM companies c
                    WHERE c.id=t.company_id
                      AND c.code=%s
                      AND t.id=%s::uuid
                    """,
                    (
                        new_status,
                        self.request.id,
                        started_at,
                        datetime.now(timezone.utc).isoformat(),
                        psycopg.types.json.Jsonb(runtime_extra) if runtime_extra else None,
                        company_code,
                        task_id,
                    ),
                )
            conn.commit()

    # Start
    set_status("running")

    elapsed = 0
    was_paused = False

    try:
        while elapsed < int(seconds):
            ctl = get_task_control(company_code, task_id) or {}

            # CANCEL
            if ctl.get("cancel") is True:
                set_status("canceled", worker_finished_at=datetime.now(timezone.utc).isoformat())
                return {"ok": False, "state": "CANCELED", "elapsed": elapsed, "started_at": started_at}

            # PAUSE
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

            # Heartbeat léger
            if elapsed % 5 == 0:
                set_status("running")

        set_status("done", worker_finished_at=datetime.now(timezone.utc).isoformat())
        return {"ok": True, "state": "DONE", "elapsed": elapsed, "started_at": started_at}

    except Exception as e:
        set_status(
            "failed",
            worker_finished_at=datetime.now(timezone.utc).isoformat(),
            worker_error=str(e),
        )
        raise
