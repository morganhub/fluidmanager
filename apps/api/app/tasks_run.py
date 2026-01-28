from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .celery_client import celery_app
from .db import get_db

router = APIRouter()


# ----------------------------
# Helpers
# ----------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _insert_task_event(
    db: AsyncSession,
    company_id: UUID,
    task_id: UUID,
    event_type: str,
    payload: dict,
) -> None:
    await db.execute(
        text("""
            INSERT INTO task_events (company_id, task_id, event_type, actor_type, payload)
            VALUES (:company_id, :task_id, :event_type, 'system', CAST(:payload AS jsonb))
        """),
        {
            "company_id": company_id,
            "task_id": task_id,
            "event_type": event_type,
            "payload": json.dumps(payload),
        },
    )


async def _load_task(
    db: AsyncSession,
    company_code: str,
    task_id: UUID,
    lock: bool = False,
) -> Optional[dict]:
    sql = """
        SELECT
            t.id,
            t.company_id,
            t.status,
            (SELECT p.code FROM projects p WHERE p.id = t.project_id) AS project_code,
            t.attempt_count,
            t.max_attempts,
            t.runtime_json,
            t.control_json
        FROM tasks t
        JOIN companies c ON c.id = t.company_id
        WHERE c.code = :company_code
          AND t.id = :task_id
    """
    if lock:
        sql += " FOR UPDATE OF t"

    row = (await db.execute(text(sql), {"company_code": company_code, "task_id": task_id})).mappings().first()
    return dict(row) if row else None


# ----------------------------
# Models (React-friendly)
# ----------------------------

class RunIn(BaseModel):
    job_type: str = Field(..., min_length=1)
    payload: Dict[str, Any] = Field(default_factory=dict)


class TaskSnapshot(BaseModel):
    task_id: str
    status: str
    attempt_count: int
    max_attempts: int
    project_code: Optional[str] = None
    previous_celery_task_id: Optional[str] = None
    last_retry_at: Optional[str] = None


class JobSnapshot(BaseModel):
    celery_task_id: str
    celery_task_name: str
    celery_state: Optional[str] = None
    result: Optional[Any] = None
    error: Optional[str] = None


class RunOut(BaseModel):
    company_code: str
    project_code: str
    task: TaskSnapshot
    job: JobSnapshot


# ----------------------------
# Endpoints
# ----------------------------

@router.post("/companies/{company_code}/projects/{project_code}/tasks/{task_id}/run", response_model=RunOut)
async def run_task(
    company_code: str,
    project_code: str,
    task_id: UUID,
    body: RunIn,
    db: AsyncSession = Depends(get_db),
):
    now_iso = _now_iso()

    # Phase A: DB prepare (lock + validate + store job spec, queued, attempt_count++)
    async with db.begin():
        row = await _load_task(db, company_code, task_id, lock=True)
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")

        if row["project_code"] is not None and row["project_code"] != project_code:
            raise HTTPException(status_code=409, detail="Task not in this project")

        if row["status"] in ("done", "canceled"):
            raise HTTPException(status_code=409, detail=f"Cannot run a task in status={row['status']}")

        if int(row["attempt_count"]) >= int(row["max_attempts"]):
            raise HTTPException(status_code=409, detail="Max attempts reached")

        # Job spec stable: fm.run_task(company_code, task_id) + runtime_json.job_type/payload
        updated = (await db.execute(text("""
            UPDATE tasks t
            SET control_json = COALESCE(t.control_json,'{}'::jsonb)
                  || jsonb_build_object('pause', false, 'cancel', false),
                should_stop = false,
                last_error = NULL,
                status = 'queued',
                attempt_count = t.attempt_count + 1,
                runtime_json = (
                    COALESCE(t.runtime_json,'{}'::jsonb)
                    - 'celery_task_id'
                    - 'previous_celery_task_id'
                    - 'last_retry_at'
                    || jsonb_build_object(
                        'job_type', to_jsonb(CAST(:job_type AS text)),
                        'job_payload', CAST(:job_payload AS jsonb),
                        'celery_task_name', to_jsonb(CAST(:celery_task_name AS text)),
                        'celery_args', jsonb_build_array(
                            to_jsonb(CAST(:company_code AS text)),
                            to_jsonb(CAST(:task_id AS text))
                        ),
                        'celery_kwargs', '{}'::jsonb
                    )
                )
            FROM companies c
            WHERE c.id = t.company_id
              AND c.code = :company_code
              AND t.id = :task_id
              AND t.attempt_count < t.max_attempts
            RETURNING t.company_id, t.attempt_count, t.max_attempts
        """), {
            "company_code": company_code,
            "task_id": task_id,
            "job_type": body.job_type,
            "job_payload": json.dumps(body.payload),
            "celery_task_name": "fm.run_task",
        })).mappings().first()

        if not updated:
            raise HTTPException(status_code=409, detail="Run refused (max_attempts reached)")

        await _insert_task_event(
            db,
            row["company_id"],
            task_id,
            "run_requested",
            {"job_type": body.job_type, "job_payload": body.payload, "ts": now_iso},
        )

    # Phase B: enqueue (outside transaction)
    try:
        async_result = celery_app.send_task("fm.run_task", args=[company_code, str(task_id)], kwargs={})
    except Exception as e:
        # reflect enqueue failure
        async with db.begin():
            row2 = await _load_task(db, company_code, task_id, lock=True)
            if row2:
                await db.execute(text("""
                    UPDATE tasks t
                    SET status='failed',
                        last_error=:err
                    FROM companies c
                    WHERE c.id=t.company_id AND c.code=:company_code AND t.id=:task_id
                """), {"company_code": company_code, "task_id": task_id, "err": str(e)})

                await _insert_task_event(
                    db,
                    row2["company_id"],
                    task_id,
                    "run_enqueue_failed",
                    {"error": str(e), "ts": _now_iso()},
                )
        raise HTTPException(status_code=500, detail=f"Celery enqueue failed: {e}")

    # Phase C: store celery_task_id
    async with db.begin():
        row3 = await _load_task(db, company_code, task_id, lock=True)
        if not row3:
            raise HTTPException(status_code=404, detail="Task not found (after enqueue)")

        await db.execute(text("""
            UPDATE tasks t
            SET runtime_json = COALESCE(t.runtime_json,'{}'::jsonb)
                || jsonb_build_object(
                    'previous_celery_task_id', runtime_json->>'celery_task_id',
                    'celery_task_id', to_jsonb(CAST(:celery_id AS text))
                )
            FROM companies c
            WHERE c.id=t.company_id AND c.code=:company_code AND t.id=:task_id
        """), {"company_code": company_code, "task_id": task_id, "celery_id": async_result.id})

        await _insert_task_event(
            db,
            row3["company_id"],
            task_id,
            "run_enqueued",
            {"celery_task_id": async_result.id, "ts": _now_iso()},
        )

    return RunOut(
        company_code=company_code,
        project_code=project_code,
        task=TaskSnapshot(
            task_id=str(task_id),
            status="queued",
            attempt_count=int(updated["attempt_count"]),
            max_attempts=int(updated["max_attempts"]),
            project_code=row["project_code"],
        ),
        job=JobSnapshot(
            celery_task_id=async_result.id,
            celery_task_name="fm.run_task",
        ),
    )


@router.post("/companies/{company_code}/projects/{project_code}/tasks/{task_id}/retry", response_model=RunOut)
async def retry_task(
    company_code: str,
    project_code: str,
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    now_iso = _now_iso()

    # Phase A: lock + validate + mark queued + attempt_count++
    async with db.begin():
        row = await _load_task(db, company_code, task_id, lock=True)
        if not row:
            raise HTTPException(status_code=404, detail="Task not found")

        if row["project_code"] is not None and row["project_code"] != project_code:
            raise HTTPException(status_code=409, detail="Task not in this project")

        if row["status"] in ("done", "canceled"):
            raise HTTPException(status_code=409, detail=f"Cannot retry a task in status={row['status']}")

        if int(row["attempt_count"]) >= int(row["max_attempts"]):
            raise HTTPException(status_code=409, detail="Max attempts reached")

        runtime = row["runtime_json"] or {}
        job_type = runtime.get("job_type")
        job_payload = runtime.get("job_payload") or {}
        if isinstance(job_payload, str):
            try:
                job_payload = json.loads(job_payload)
            except Exception:
                job_payload = {}

        if not job_type:
            raise HTTPException(status_code=409, detail="Missing job spec in runtime_json (expected job_type)")

        previous_celery_id = runtime.get("celery_task_id")

        updated = (await db.execute(text("""
            UPDATE tasks t
            SET control_json = COALESCE(t.control_json,'{}'::jsonb)
                  || jsonb_build_object('pause', false, 'cancel', false),
                should_stop = false,
                last_error = NULL,
                status = 'queued',
                attempt_count = t.attempt_count + 1,
                runtime_json = COALESCE(t.runtime_json,'{}'::jsonb)
                  || jsonb_build_object(
                        'previous_celery_task_id', to_jsonb(CAST(:prev_celery_id AS text)),
                        'last_retry_at', to_jsonb(CAST(:now_iso AS text))
                     )
            FROM companies c
            WHERE c.id=t.company_id
              AND c.code=:company_code
              AND t.id=:task_id
              AND t.attempt_count < t.max_attempts
            RETURNING t.company_id, t.attempt_count, t.max_attempts
        """), {
            "company_code": company_code,
            "task_id": task_id,
            "prev_celery_id": previous_celery_id or "",
            "now_iso": now_iso,
        })).mappings().first()

        if not updated:
            raise HTTPException(status_code=409, detail="Retry refused (max_attempts reached)")

        await _insert_task_event(
            db,
            row["company_id"],
            task_id,
            "retry_requested",
            {"previous_celery_task_id": previous_celery_id, "job_type": job_type, "ts": now_iso},
        )

    # Phase B: enqueue
    try:
        async_result = celery_app.send_task("fm.run_task", args=[company_code, str(task_id)], kwargs={})
    except Exception as e:
        async with db.begin():
            row2 = await _load_task(db, company_code, task_id, lock=True)
            if row2:
                await db.execute(text("""
                    UPDATE tasks t
                    SET status='failed',
                        last_error=:err
                    FROM companies c
                    WHERE c.id=t.company_id AND c.code=:company_code AND t.id=:task_id
                """), {"company_code": company_code, "task_id": task_id, "err": str(e)})

                await _insert_task_event(
                    db,
                    row2["company_id"],
                    task_id,
                    "retry_enqueue_failed",
                    {"error": str(e), "ts": _now_iso()},
                )
        raise HTTPException(status_code=500, detail=f"Celery enqueue failed: {e}")

    # Phase C: store new celery_task_id
    async with db.begin():
        row3 = await _load_task(db, company_code, task_id, lock=True)
        if not row3:
            raise HTTPException(status_code=404, detail="Task not found (after enqueue)")

        await db.execute(text("""
            UPDATE tasks t
            SET runtime_json = COALESCE(t.runtime_json,'{}'::jsonb)
                || jsonb_build_object('celery_task_id', to_jsonb(CAST(:celery_id AS text)))
            FROM companies c
            WHERE c.id=t.company_id AND c.code=:company_code AND t.id=:task_id
        """), {"company_code": company_code, "task_id": task_id, "celery_id": async_result.id})

        await _insert_task_event(
            db,
            row3["company_id"],
            task_id,
            "retry_enqueued",
            {"celery_task_id": async_result.id, "ts": _now_iso()},
        )

    return RunOut(
        company_code=company_code,
        project_code=project_code,
        task=TaskSnapshot(
            task_id=str(task_id),
            status="queued",
            attempt_count=int(updated["attempt_count"]),
            max_attempts=int(updated["max_attempts"]),
            project_code=row["project_code"],
            previous_celery_task_id=previous_celery_id,
            last_retry_at=now_iso,
        ),
        job=JobSnapshot(
            celery_task_id=async_result.id,
            celery_task_name="fm.run_task",
        ),
    )


@router.get("/companies/{company_code}/tasks/{task_id}/status")
async def task_status(company_code: str, task_id: UUID, db: AsyncSession = Depends(get_db)):
    row = await _load_task(db, company_code, task_id, lock=False)
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")

    runtime = row.get("runtime_json") or {}
    celery_task_id = runtime.get("celery_task_id")

    job: dict[str, Any] = {"celery_task_id": celery_task_id, "celery_state": None}
    if celery_task_id:
        r = AsyncResult(str(celery_task_id), app=celery_app)
        job["celery_state"] = r.state
        if r.successful():
            job["result"] = r.result
        elif r.failed():
            job["error"] = str(r.result)

    return {
        "company_code": company_code,
        "task_id": str(task_id),
        "task": {
            "id": str(row["id"]),
            "company_id": str(row["company_id"]),
            "status": row["status"],
            "project_code": row["project_code"],
            "attempt_count": int(row["attempt_count"]),
            "max_attempts": int(row["max_attempts"]),
            "runtime_json": runtime,
            "control_json": row.get("control_json") or {},
        },
        "job": job,
    }
