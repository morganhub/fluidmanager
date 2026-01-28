from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
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


class AddDependenciesIn(BaseModel):
    dependee_task_ids: list[str] = Field(..., min_length=1)


@router.post("/companies/{company_code}/tasks/{waiter_task_id}/dependencies")
async def add_dependencies(
    company_code: str,
    waiter_task_id: UUID,
    body: AddDependenciesIn,
    db: AsyncSession = Depends(get_db),
):
    dep_ids: list[UUID] = []
    for s in body.dependee_task_ids:
        try:
            dep_ids.append(UUID(s))
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid UUID in dependee_task_ids: {s}")

    now_iso = _now_iso()

    try:
        async with db.begin():
            # 1) validate waiter task exists + company_id
            waiter = (await db.execute(text("""
                SELECT t.id, t.company_id, t.status
                FROM tasks t
                JOIN companies c ON c.id=t.company_id
                WHERE c.code=:company_code AND t.id=:task_id
                LIMIT 1
            """), {"company_code": company_code, "task_id": waiter_task_id})).mappings().first()

            if not waiter:
                raise HTTPException(status_code=404, detail="Waiter task not found")

            # 2) validate dependees exist in same company
            rows = (await db.execute(text("""
                SELECT t.id
                FROM tasks t
                WHERE t.company_id=:company_id AND t.id = ANY(:ids)
            """), {"company_id": waiter["company_id"], "ids": dep_ids})).mappings().all()

            if len(rows) != len(dep_ids):
                raise HTTPException(status_code=409, detail="Some dependee tasks do not exist in this company")

            # 3) insert deps
            await db.execute(text("""
                INSERT INTO task_dependencies (waiter_task_id, dependee_task_id)
                SELECT :waiter_id, x::uuid
                FROM unnest(:dep_ids::uuid[]) AS x
                ON CONFLICT (waiter_task_id, dependee_task_id) DO NOTHING
            """), {"waiter_id": waiter_task_id, "dep_ids": dep_ids})

            await _insert_task_event(
                db,
                waiter["company_id"],
                waiter_task_id,
                "dependencies_added",
                {"dependee_task_ids": [str(x) for x in dep_ids], "ts": now_iso},
            )

        return {"ok": True, "waiter_task_id": str(waiter_task_id), "dependee_task_ids": [str(x) for x in dep_ids]}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"add_dependencies failed: {e}")



@router.get("/companies/{company_code}/tasks/{task_id}/dependencies")
async def list_dependencies(
    company_code: str,
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    # waiter -> dependees
    rows = (await db.execute(text("""
        SELECT
            d.dependee_task_id,
            t.status,
            t.title,
            t.runtime_json,
            t.control_json
        FROM task_dependencies d
        JOIN tasks t ON t.id = d.dependee_task_id
        JOIN tasks w ON w.id = d.waiter_task_id
        JOIN companies c ON c.id = w.company_id
        WHERE c.code = :company_code
          AND w.id = :task_id
        ORDER BY t.created_at ASC
    """), {"company_code": company_code, "task_id": task_id})).mappings().all()

    return {"items": [{**dict(r), "dependee_task_id": str(r["dependee_task_id"])} for r in rows]}


@router.get("/companies/{company_code}/tasks/{task_id}/dependents")
async def list_dependents(
    company_code: str,
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    # dependee -> waiters
    rows = (await db.execute(text("""
        SELECT
            d.waiter_task_id,
            w.status,
            w.title,
            w.runtime_json,
            w.control_json
        FROM task_dependencies d
        JOIN tasks w ON w.id = d.waiter_task_id
        JOIN tasks t ON t.id = d.dependee_task_id
        JOIN companies c ON c.id = w.company_id
        WHERE c.code = :company_code
          AND t.id = :task_id
        ORDER BY w.created_at ASC
    """), {"company_code": company_code, "task_id": task_id})).mappings().all()

    return {"items": [{**dict(r), "waiter_task_id": str(r["waiter_task_id"])} for r in rows]}
