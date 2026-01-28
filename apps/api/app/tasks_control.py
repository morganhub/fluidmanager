from uuid import UUID
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db

router = APIRouter()


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


@router.get("/companies/{company_code}/tasks/{task_id}")
async def get_task(company_code: str, task_id: UUID, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(text("""
        SELECT
            t.id,
            t.title,
            t.status,
            t.priority,
            t.created_at,
            t.deadline_at,
            t.attempt_count,
            t.max_attempts,
            t.runtime_json,
            t.control_json
        FROM tasks t
        JOIN companies c ON c.id = t.company_id
        WHERE c.code = :company_code
          AND t.id = :task_id
        LIMIT 1
    """), {"company_code": company_code, "task_id": task_id})).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Task not found")

    return dict(row)


@router.post("/companies/{company_code}/tasks/{task_id}/reset")
async def reset_task_controls(company_code: str, task_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    Reset control flags: pause=false, cancel=false.
    """
    try:
        row = (await db.execute(text("""
            UPDATE tasks t
            SET control_json = COALESCE(t.control_json,'{}'::jsonb)
              || jsonb_build_object('pause', false, 'cancel', false)
            FROM companies c
            WHERE c.id=t.company_id
              AND c.code=:company_code
              AND t.id=:task_id
            RETURNING t.id, t.company_id, t.control_json
        """), {"company_code": company_code, "task_id": task_id})).mappings().first()

        if not row:
            raise HTTPException(status_code=404, detail="Task not found")

        await _insert_task_event(
            db,
            row["company_id"],
            task_id,
            "reset",
            {"pause": False, "cancel": False, "ts": _now_iso()},
        )

        await db.commit()
        return {"id": str(row["id"]), "control_json": row["control_json"]}

    except Exception:
        await db.rollback()
        raise


@router.post("/companies/{company_code}/tasks/{task_id}/pause")
async def pause_task(company_code: str, task_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    pause=true (ne touche pas cancel).
    """
    try:
        row = (await db.execute(text("""
            UPDATE tasks t
            SET control_json = COALESCE(t.control_json,'{}'::jsonb)
                || jsonb_build_object('pause', true)
            FROM companies c
            WHERE c.id=t.company_id
              AND c.code=:company_code
              AND t.id=:task_id
            RETURNING t.id, t.company_id, t.control_json
        """), {"company_code": company_code, "task_id": task_id})).mappings().first()

        if not row:
            raise HTTPException(status_code=404, detail="Task not found")

        await _insert_task_event(
            db,
            row["company_id"],
            task_id,
            "pause",
            {"pause": True, "ts": _now_iso()},
        )

        await db.commit()
        return {"id": str(row["id"]), "control_json": row["control_json"]}

    except Exception:
        await db.rollback()
        raise


@router.post("/companies/{company_code}/tasks/{task_id}/resume")
async def resume_task(company_code: str, task_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    pause=false + cancel=false.
    """
    try:
        row = (await db.execute(text("""
            UPDATE tasks t
            SET control_json = COALESCE(t.control_json,'{}'::jsonb)
                || jsonb_build_object('pause', false, 'cancel', false)
            FROM companies c
            WHERE c.id=t.company_id
              AND c.code=:company_code
              AND t.id=:task_id
            RETURNING t.id, t.company_id, t.control_json
        """), {"company_code": company_code, "task_id": task_id})).mappings().first()

        if not row:
            raise HTTPException(status_code=404, detail="Task not found")

        await _insert_task_event(
            db,
            row["company_id"],
            task_id,
            "resume",
            {"pause": False, "cancel": False, "ts": _now_iso()},
        )

        await db.commit()
        return {"id": str(row["id"]), "control_json": row["control_json"]}

    except Exception:
        await db.rollback()
        raise


@router.post("/companies/{company_code}/tasks/{task_id}/cancel")
async def cancel_task(company_code: str, task_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    cancel=true (et met pause=false pour éviter un état ambigu).
    """
    try:
        row = (await db.execute(text("""
            UPDATE tasks t
            SET control_json = COALESCE(t.control_json,'{}'::jsonb)
                || jsonb_build_object('cancel', true, 'pause', false)
            FROM companies c
            WHERE c.id=t.company_id
              AND c.code=:company_code
              AND t.id=:task_id
            RETURNING t.id, t.company_id, t.control_json
        """), {"company_code": company_code, "task_id": task_id})).mappings().first()

        if not row:
            raise HTTPException(status_code=404, detail="Task not found")

        await _insert_task_event(
            db,
            row["company_id"],
            task_id,
            "cancel",
            {"cancel": True, "pause": False, "ts": _now_iso()},
        )

        await db.commit()
        return {"id": str(row["id"]), "control_json": row["control_json"]}

    except Exception:
        await db.rollback()
        raise
