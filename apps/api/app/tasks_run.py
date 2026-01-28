from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
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
    payload: dict[str, Any],
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


async def _load_task_row(
    db: AsyncSession,
    company_code: str,
    task_id: UUID,
    lock: bool,
) -> dict[str, Any] | None:
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

    row = (
        await db.execute(
            text(sql),
            {"company_code": company_code, "task_id": task_id},
        )
    ).mappings().first()
    return dict(row) if row else None


# ----------------------------
# Response models (React-friendly)
# ----------------------------

class TaskOut(BaseModel):
    task_id: str
    status: str
    attempt_count: int
    max_attempts: int
    project_code: Optional[str] = None
    previous_celery_task_id: Optional[str] = None
    last_retry_at: Optional[str] = None


class JobOut(BaseModel):
    celery_task_id: str
    celery_task_name: str
    celery_state: Optional[str] = None
    result: Optional[Any] = None
    error: Optional[str] = None


class RunLongDemoOut(BaseModel):
    company_code: str
    project_code: str
    seconds: int
    task: TaskOut
    job: JobOut


class RetryOut(BaseModel):
    company_code: str
    project_code: str
    task: TaskOut
    job: JobOut


class StatusOut(BaseModel):
    company_code: str
    task_id: str
    task: dict[str, Any]
    job: Optional[dict[str, Any]] = None


# ----------------------------
# Endpoints
# ----------------------------

@router.post(
    "/companies/{company_code}/projects/{project_code}/tasks/{task_id}/run/long-demo",
    response_model=RunLongDemoOut,
)
async def run_long_demo(
    company_code: str,
    project_code: str,
    task_id: UUID,
    seconds: int = Query(60, ge=1, le=3600),
    db: AsyncSession = Depends(get_db),
):
    task_name = "fm.long_demo"
    args = [company_code, str(task_id), int(seconds)]
    now_iso = _now_iso()

    # Phase A: DB prepare (NO celery call inside the transaction)
    try:
        async with db.begin():
            row = await _load_task_row(db, company_code, task_id, lock=True)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")

            if row["project_code"] is not None and row["project_code"] != project_code:
                raise HTTPException(status_code=409, detail="Task not in this project")

            # reset control plane + set queued + store "job spec" (retryable)
            await db.execute(
                text("""
                    UPDATE tasks t
                    SET control_json = COALESCE(t.control_json,'{}'::jsonb)
                          || jsonb_build_object('pause', false, 'cancel', false),
                        should_stop = false,
                        last_error = NULL,
                        status = 'queued',
                        runtime_json = (
                            COALESCE(t.runtime_json,'{}'::jsonb)
                            - 'celery_task_id'
                            - 'previous_celery_task_id'
                            - 'last_retry_at'
                            || jsonb_build_object(
                                'celery_task_name', to_jsonb(CAST(:task_name AS text)),
                                'celery_args', CAST(:args AS jsonb),
                                'celery_kwargs', CAST(:kwargs AS jsonb)
                            )
                        )
                    FROM companies c
                    WHERE c.id=t.company_id
                      AND c.code=:company_code
                      AND t.id=:task_id
                """),
                {
                    "company_code": company_code,
                    "task_id": task_id,
                    "task_name": task_name,
                    "args": json.dumps(args),
                    "kwargs": json.dumps({}),
                },
            )

            await _insert_task_event(
                db,
                row["company_id"],
                task_id,
                "run_requested",
                {"celery_task_name": task_name, "celery_args": args, "ts": now_iso},
            )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"DB error while preparing run: {e}")

    # Phase B: enqueue
    try:
        async_result = celery_app.send_task(task_name, args=args)
    except Exception as e:
        # best-effort: reflect enqueue failure in DB
        try:
            async with db.begin():
                row = await _load_task_row(db, company_code, task_id, lock=True)
                if row:
                    await db.execute(
                        text("""
                            UPDATE tasks t
                            SET status='failed',
                                last_error=:err
                            FROM companies c
                            WHERE c.id=t.company_id AND c.code=:company_code AND t.id=:task_id
                        """),
                        {"company_code": company_code, "task_id": task_id, "err": str(e)},
                    )
                    await _insert_task_event(
                        db,
                        row["company_id"],
                        task_id,
                        "run_enqueue_failed",
                        {"error": str(e), "ts": _now_iso()},
                    )
        except Exception:
            await db.rollback()
        raise HTTPException(status_code=500, detail=f"Celery enqueue failed: {e}")

    # Phase C: DB finalize (store celery_task_id)
    try:
        async with db.begin():
            row = await _load_task_row(db, company_code, task_id, lock=True)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found (after enqueue)")

            await db.execute(
                text("""
                    UPDATE tasks t
                    SET runtime_json = COALESCE(t.runtime_json,'{}'::jsonb)
                        || jsonb_build_object(
                            'celery_task_id', to_jsonb(CAST(:celery_id AS text))
                        )
                    FROM companies c
                    WHERE c.id=t.company_id
                      AND c.code=:company_code
                      AND t.id=:task_id
                """),
                {"company_code": company_code, "task_id": task_id, "celery_id": async_result.id},
            )

            await _insert_task_event(
                db,
                row["company_id"],
                task_id,
                "run_enqueued",
                {"celery_task_id": async_result.id, "celery_task_name": task_name, "ts": _now_iso()},
            )

        # reload minimal state for response
        final = await _load_task_row(db, company_code, task_id, lock=False)
        attempt_count = int(final["attempt_count"]) if final else int(row["attempt_count"])
        max_attempts = int(final["max_attempts"]) if final else int(row["max_attempts"])
        proj = final["project_code"] if final else row["project_code"]

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"DB error while finalizing run: {e}")

    return RunLongDemoOut(
        company_code=company_code,
        project_code=project_code,
        seconds=int(seconds),
        task=TaskOut(
            task_id=str(task_id),
            status="queued",
            attempt_count=attempt_count,
            max_attempts=max_attempts,
            project_code=proj,
        ),
        job=JobOut(
            celery_task_id=async_result.id,
            celery_task_name=task_name,
        ),
    )


@router.post(
    "/companies/{company_code}/projects/{project_code}/tasks/{task_id}/retry",
    response_model=RetryOut,
)
async def retry_task(
    company_code: str,
    project_code: str,
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    now_iso = _now_iso()

    # Phase A: lock + validate + increment attempt + reset controls
    try:
        async with db.begin():
            row = await _load_task_row(db, company_code, task_id, lock=True)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")

            if row["project_code"] is not None and row["project_code"] != project_code:
                raise HTTPException(status_code=409, detail="Task not in this project")

            if row["status"] in ("done", "canceled"):
                raise HTTPException(status_code=409, detail=f"Cannot retry a task in status={row['status']}")

            if int(row["attempt_count"]) >= int(row["max_attempts"]):
                raise HTTPException(status_code=409, detail="Max attempts reached")

            runtime = row["runtime_json"] or {}
            task_name = runtime.get("celery_task_name")
            args = runtime.get("celery_args")
            kwargs = runtime.get("celery_kwargs") or {}

            if not task_name or args is None:
                raise HTTPException(
                    status_code=409,
                    detail="Missing job spec in runtime_json (expected celery_task_name + celery_args)",
                )

            previous_celery_id = runtime.get("celery_task_id")

            # prepare retry: attempt_count++ + queued + reset control flags
            updated = (
                await db.execute(
                    text("""
                        UPDATE tasks t
                        SET control_json = COALESCE(t.control_json,'{}'::jsonb)
                              || jsonb_build_object('pause', false, 'cancel', false),
                            should_stop = false,
                            last_error = NULL,
                            attempt_count = t.attempt_count + 1,
                            status = 'queued',
                            runtime_json = (
                                COALESCE(t.runtime_json,'{}'::jsonb)
                                || jsonb_build_object(
                                    'previous_celery_task_id', to_jsonb(CAST(:prev_celery_id AS text)),
                                    'last_retry_at', to_jsonb(CAST(:now_iso AS text))
                                )
                            )
                        WHERE t.id = :task_id
                          AND t.attempt_count < t.max_attempts
                        RETURNING t.company_id, t.attempt_count, t.max_attempts
                    """),
                    {
                        "task_id": task_id,
                        "prev_celery_id": previous_celery_id or "",
                        "now_iso": now_iso,
                    },
                )
            ).mappings().first()

            if not updated:
                raise HTTPException(status_code=409, detail="Retry refused (max_attempts reached)")

            await _insert_task_event(
                db,
                updated["company_id"],
                task_id,
                "retry_requested",
                {
                    "previous_celery_task_id": previous_celery_id,
                    "celery_task_name": task_name,
                    "celery_args": args,
                    "celery_kwargs": kwargs,
                    "attempt_count": updated["attempt_count"],
                    "max_attempts": updated["max_attempts"],
                    "ts": now_iso,
                },
            )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"DB error while preparing retry: {e}")

    # Phase B: enqueue
    try:
        async_result = celery_app.send_task(task_name, args=args, kwargs=kwargs)
    except Exception as e:
        # best-effort: reflect enqueue failure in DB
        try:
            async with db.begin():
                row2 = await _load_task_row(db, company_code, task_id, lock=True)
                if row2:
                    await db.execute(
                        text("""
                            UPDATE tasks t
                            SET status='failed',
                                last_error=:err
                            FROM companies c
                            WHERE c.id=t.company_id AND c.code=:company_code AND t.id=:task_id
                        """),
                        {"company_code": company_code, "task_id": task_id, "err": str(e)},
                    )
                    await _insert_task_event(
                        db,
                        row2["company_id"],
                        task_id,
                        "retry_enqueue_failed",
                        {"error": str(e), "ts": _now_iso()},
                    )
        except Exception:
            await db.rollback()
        raise HTTPException(status_code=500, detail=f"Celery enqueue failed: {e}")

    # Phase C: store new celery_task_id
    try:
        async with db.begin():
            row3 = await _load_task_row(db, company_code, task_id, lock=True)
            if not row3:
                raise HTTPException(status_code=404, detail="Task not found (after enqueue)")

            await db.execute(
                text("""
                    UPDATE tasks t
                    SET runtime_json = COALESCE(t.runtime_json,'{}'::jsonb)
                        || jsonb_build_object(
                            'celery_task_id', to_jsonb(CAST(:new_celery_id AS text))
                        )
                    FROM companies c
                    WHERE c.id=t.company_id
                      AND c.code=:company_code
                      AND t.id=:task_id
                """),
                {"company_code": company_code, "task_id": task_id, "new_celery_id": async_result.id},
            )

            await _insert_task_event(
                db,
                row3["company_id"],
                task_id,
                "retry_enqueued",
                {"celery_task_id": async_result.id, "celery_task_name": task_name, "ts": _now_iso()},
            )

        final = await _load_task_row(db, company_code, task_id, lock=False)

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"DB error while finalizing retry: {e}")

    runtime_final = (final or {}).get("runtime_json") or {}
    return RetryOut(
        company_code=company_code,
        project_code=project_code,
        task=TaskOut(
            task_id=str(task_id),
            status=(final or {}).get("status") or "queued",
            attempt_count=int((final or {}).get("attempt_count") or 0),
            max_attempts=int((final or {}).get("max_attempts") or 0),
            project_code=(final or {}).get("project_code"),
            previous_celery_task_id=runtime_final.get("previous_celery_task_id"),
            last_retry_at=runtime_final.get("last_retry_at"),
        ),
        job=JobOut(
            celery_task_id=async_result.id,
            celery_task_name=task_name,
        ),
    )


@router.get("/companies/{company_code}/tasks/{task_id}/status", response_model=StatusOut)
async def task_status(
    company_code: str,
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    row = await _load_task_row(db, company_code, task_id, lock=False)
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")

    runtime = row.get("runtime_json") or {}
    celery_id = runtime.get("celery_task_id")
    job: Optional[dict[str, Any]] = None

    if celery_id:
        r = AsyncResult(str(celery_id), app=celery_app)
        job = {"celery_task_id": str(celery_id), "celery_state": r.state}
        # react-friendly: include result/error if ready
        if r.successful():
            job["result"] = r.result
        elif r.failed():
            job["error"] = str(r.result)

    # keep task payload as-is (runtime/control included) for UI
    task_payload = {
        "id": str(row["id"]),
        "company_id": str(row["company_id"]),
        "status": row["status"],
        "project_code": row["project_code"],
        "attempt_count": int(row["attempt_count"]),
        "max_attempts": int(row["max_attempts"]),
        "runtime_json": row.get("runtime_json") or {},
        "control_json": row.get("control_json") or {},
    }

    return StatusOut(
        company_code=company_code,
        task_id=str(task_id),
        task=task_payload,
        job=job,
    )
