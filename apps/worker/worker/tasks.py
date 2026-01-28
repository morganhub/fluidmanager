from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from .celery_app import celery_app


# ----------------------------
# Small helpers
# ----------------------------

def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


WEBHOOK_JOB_TYPES = {"webhook", "n8n_webhook", "langflow_webhook"}


@celery_app.task(name="fm.echo")
def echo(message: str) -> dict:
    return {"echo": message}


@celery_app.task(name="fm.publish_preview_zip", bind=True)
def publish_preview_zip(self, zip_b64: str, bucket: str, prefix: str, artifact_id: str) -> dict:
    import base64

    from .publish import upload_zip_to_prefix
    from .db import update_artifact_metadata

    started_at = _utc_iso()

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

        finished_at = _utc_iso()
        update_artifact_metadata(artifact_id, {
            "state": "SUCCESS",
            "finished_at": finished_at,
            "uploaded": res.get("uploaded", 0),
        })
        return {"ok": True, **res}

    except Exception as e:
        finished_at = _utc_iso()
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
    - Writes tasks.status
    """
    import psycopg
    from psycopg.rows import dict_row
    import traceback  # Ajout pour voir l'erreur exacte

    from .db import _sync_dsn, get_task_control

    print(f"--- [Worker] Starting task {task_id} for company {company_code} ---") # DEBUG

    dsn = _sync_dsn()

    def fetch_task() -> dict:
        with psycopg.connect(dsn, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        t.id::text,
                        c.code AS company_code,
                        t.company_id::text,
                        t.integration_id::text AS integration_id,
                        COALESCE(t.runtime_json,'{}'::jsonb) AS runtime_json
                    FROM tasks t
                    JOIN companies c ON c.id=t.company_id
                    WHERE c.code=%s AND t.id=%s::uuid
                    LIMIT 1
                    """,
                    (company_code, task_id),
                )
                row = cur.fetchone()
                return dict(row) if row else {}

    def insert_event(company_id: str, event_type: str, payload: dict) -> None:
        try:
            with psycopg.connect(dsn) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO task_events (company_id, task_id, event_type, actor_type, payload)
                        VALUES (%s::uuid, %s::uuid, %s, 'system', %s::jsonb)
                        """,
                        (company_id, task_id, event_type, json.dumps(payload)),
                    )
                conn.commit()
        except Exception as e:
            print(f"--- [Worker] Error inserting event: {e} ---")

    def set_status(
        new_status: str,
        patch_runtime: Optional[dict] = None,
        last_error: Optional[str] = None,
    ) -> None:
        print(f"--- [Worker] Set status to {new_status} (error={last_error}) ---") # DEBUG
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

    try:
        task = fetch_task()
        if not task:
            print(f"--- [Worker] Task {task_id} not found in DB ---")
            raise RuntimeError("Task not found")

        runtime = task.get("runtime_json") or {}
        job_type = runtime.get("job_type")
        job_payload = runtime.get("job_payload") or {}

        print(f"--- [Worker] Job Type: {job_type} ---") # DEBUG

        started_at = _utc_iso()

        # start
        set_status("running", patch_runtime={"started_at": started_at, "job_type": job_type})
        insert_event(task["company_id"], "task_started", {"ts": started_at, "job_type": job_type})

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

        if job_type in WEBHOOK_JOB_TYPES:
            print("--- [Worker] Delegating to _handle_webhook_trigger ---") # DEBUG
            return _handle_webhook_trigger(
                company_code=company_code,
                task_id=task_id,
                integration_id=(task.get("integration_id") or runtime.get("integration_id") or ""),
                job_type=str(job_type),
                job_payload=job_payload,
                dsn=dsn,
                set_status=set_status,
                insert_event=lambda et, pl: insert_event(task["company_id"], et, pl),
            )

        raise ValueError(f"Unknown job_type={job_type!r}")

    except Exception as e:
        print(f"--- [Worker] CRASH in run_task: {e} ---") # DEBUG
        traceback.print_exc() # Imprime la trace complète dans les logs
        finished_at = _utc_iso()
        set_status("failed", patch_runtime={"finished_at": finished_at}, last_error=str(e))
        if 'task' in locals() and task:
             insert_event(task["company_id"], "task_failed", {"ts": finished_at, "error": str(e)})
        raise


def _handle_long_demo(
    company_code: str,
    task_id: str,
    seconds: int,
    started_at: str,
    dsn: str,
    set_status: Callable,
    get_task_control: Callable,
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


def _handle_webhook_trigger(
    company_code: str,
    task_id: str,
    integration_id: str,
    job_type: str,
    job_payload: dict,
    dsn: str,
    set_status: Callable,
    insert_event: Callable[[str, dict], None],
) -> dict:
    """
    Convention payload:
      - webhook:        { "url": "https://...", "body": {...} }  OR { "path": "/webhook/xxx", "body": {...} }
      - n8n_webhook:    { "path": "/webhook/xxx", "body": {...} }
      - langflow_webhook:{ "path": "/api/v1/run/xxx", "body": {...} }

    Integration config_json must contain base_url.
    Integration secret_json must contain callback_secret (for API validation later).
    """
    import httpx
    import psycopg
    from psycopg.rows import dict_row

    if not integration_id:
        raise ValueError("integration_id is required for webhook job_type")

    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    i.id::text AS integration_id,
                    i.is_active,
                    p.code AS provider_code,
                    COALESCE(i.config_json,'{}'::jsonb) AS config_json,
                    COALESCE(s.secret_json,'{}'::jsonb) AS secret_json
                FROM integrations i
                JOIN integration_providers p ON p.id = i.provider_id
                LEFT JOIN integration_secrets s ON s.id::text = i.secrets_ref
                JOIN companies c ON c.id = i.company_id
                WHERE c.code = %s
                  AND i.id = %s::uuid
                LIMIT 1
                """,
                (company_code, integration_id),
            )
            integ = cur.fetchone()

    if not integ:
        raise ValueError("Integration not found for this company")
    if not integ["is_active"]:
        raise ValueError("Integration disabled")

    base_url = (integ["config_json"] or {}).get("base_url") or ""
    if not base_url and job_type != "webhook":
        raise ValueError("integration.config_json.base_url is required")

    # Resolve final URL
    url = ""
    if job_type == "webhook" and isinstance(job_payload.get("url"), str) and job_payload["url"].strip():
        url = job_payload["url"].strip()
    else:
        path = (job_payload.get("path") or "").strip()
        if not path:
            raise ValueError("payload.path is required for webhook job_type (unless payload.url is provided)")
        url = base_url.rstrip("/") + "/" + path.lstrip("/")

    body = job_payload.get("body")
    if body is None:
        # default: pass the full payload (except url/path) as body
        body = {k: v for k, v in job_payload.items() if k not in ("url", "path")}

    # optional callback url (recommandé: mettre PUBLIC_API_BASE_URL dans env worker)
    public_api_base = (job_payload.get("callback_base_url") or "").strip()
    callback_url = ""
    if public_api_base:
        callback_url = public_api_base.rstrip("/") + f"/companies/{company_code}/tasks/{task_id}/callback"

    # Trigger
    triggered_at = _utc_iso()
    insert_event("webhook_trigger_start", {"ts": triggered_at, "url": url, "job_type": job_type})

    try:
        with httpx.Client(timeout=10.0) as client:
            res = client.post(
                url,
                json={
                    "company_code": company_code,
                    "task_id": task_id,
                    "payload": body,
                    "callback_url": callback_url or None,
                },
                headers={"Content-Type": "application/json"},
            )
        # fail fast on non-2xx
        if res.status_code < 200 or res.status_code >= 300:
            raise RuntimeError(f"Webhook HTTP {res.status_code}: {res.text[:300]}")

    except Exception as e:
        finished_at = _utc_iso()
        insert_event("webhook_trigger_failed", {"ts": finished_at, "error": str(e), "url": url})
        raise

    # Once triggered: we block waiting external callback
    set_status(
        "blocked",
        patch_runtime={
            "blocked_reason": "waiting_callback",
            "integration_id": integration_id,
            "integration_provider": integ["provider_code"],
            "webhook_url": url,
            "triggered_at": triggered_at,
        },
    )
    insert_event("webhook_triggered", {"ts": triggered_at, "url": url, "status_code": res.status_code})
    return {"ok": True, "state": "BLOCKED", "webhook_url": url, "triggered_at": triggered_at}


# ----------------------------
# Scheduler tick (Celery Beat)
# ----------------------------

@celery_app.task(name="fm.scheduler_tick")
def scheduler_tick(limit: int = 10) -> dict:
    """
    Pick tasks that are eligible for automatic run:
      - status='queued'
      - runtime_json.job_type exists
      - runtime_json.celery_task_id missing/empty  (avoid double enqueue)
      - not paused/canceled
    Reserve rows using FOR UPDATE SKIP LOCKED.
    """
    import psycopg
    from psycopg.rows import dict_row

    from .db import _sync_dsn

    dsn = _sync_dsn()
    picked: list[dict] = []
    enqueued = 0

    # Phase A: reserve tasks (set a temporary celery_task_id marker to avoid duplicates)
    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH candidates AS (
                    SELECT
                        t.id,
                        c.code AS company_code
                    FROM tasks t
                    JOIN companies c ON c.id = t.company_id
                    WHERE t.status = 'queued'
                      AND COALESCE(t.runtime_json,'{}'::jsonb) ? 'job_type'
                      AND COALESCE(t.runtime_json->>'celery_task_id','') = ''
                      AND COALESCE((t.control_json->>'pause')::boolean, false) = false
                      AND COALESCE((t.control_json->>'cancel')::boolean, false) = false
                    ORDER BY t.created_at ASC
                    LIMIT %s
                    FOR UPDATE SKIP LOCKED
                )
                UPDATE tasks t
                SET attempt_count = t.attempt_count + 1,
                    last_error = NULL,
                    runtime_json = COALESCE(t.runtime_json,'{}'::jsonb)
                      - 'celery_task_id'
                      - 'previous_celery_task_id'
                      - 'last_retry_at'
                      || jsonb_build_object(
                          'celery_task_id', to_jsonb(CAST('__PENDING__' AS text)),
                          'celery_task_name', to_jsonb(CAST('fm.run_task' AS text)),
                          'celery_args', jsonb_build_array(
                              to_jsonb(CAST(candidates.company_code AS text)),
                              to_jsonb(CAST(candidates.id::text AS text))
                          ),
                          'celery_kwargs', '{}'::jsonb
                      )
                FROM candidates
                WHERE t.id = candidates.id
                RETURNING t.id::text AS task_id, candidates.company_code
                """,
                (limit,),
            )
            picked = [dict(r) for r in cur.fetchall()]
        conn.commit()

    # Phase B: enqueue + write real celery_task_id
    if not picked:
        return {"picked": 0, "enqueued": 0}

    for it in picked:
        company_code = it["company_code"]
        task_id = it["task_id"]
        try:
            async_res = celery_app.send_task("fm.run_task", args=[company_code, task_id], kwargs={})

            with psycopg.connect(dsn) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE tasks t
                        SET runtime_json = COALESCE(t.runtime_json,'{}'::jsonb)
                            || jsonb_build_object(
                                'previous_celery_task_id', runtime_json->>'celery_task_id',
                                'celery_task_id', to_jsonb(CAST(%s AS text))
                            )
                        FROM companies c
                        WHERE c.id=t.company_id
                          AND c.code=%s
                          AND t.id=%s::uuid
                        """,
                        (async_res.id, company_code, task_id),
                    )
                conn.commit()

            enqueued += 1

        except Exception as e:
            # reflect enqueue failure: reset celery_task_id so it can be retried later
            with psycopg.connect(dsn) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE tasks t
                        SET status='failed',
                            last_error=%s,
                            runtime_json = COALESCE(t.runtime_json,'{}'::jsonb)
                              - 'celery_task_id'
                        FROM companies c
                        WHERE c.id=t.company_id
                          AND c.code=%s
                          AND t.id=%s::uuid
                        """,
                        (str(e), company_code, task_id),
                    )
                conn.commit()

    return {"picked": len(picked), "enqueued": enqueued}
