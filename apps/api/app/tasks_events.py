from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db

router = APIRouter()

@router.get("/companies/{company_code}/tasks/{task_id}/events")
async def list_task_events(
    company_code: str,
    task_id: UUID,
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(text("""
        SELECT
            te.id,
            te.created_at,
            te.event_type,
            te.actor_type,
            te.payload
        FROM task_events te
        JOIN tasks t ON t.id = te.task_id
        JOIN companies c ON c.id = t.company_id
        WHERE c.code = :company_code
          AND t.id = :task_id
        ORDER BY te.created_at ASC
        LIMIT :limit
    """), {"company_code": company_code, "task_id": task_id, "limit": limit})).mappings().all()

    # si aucun event, on veut savoir si la task existe vraiment
    if not rows:
        exists = (await db.execute(text("""
            SELECT 1
            FROM tasks t
            JOIN companies c ON c.id=t.company_id
            WHERE c.code=:company_code AND t.id=:task_id
            LIMIT 1
        """), {"company_code": company_code, "task_id": task_id})).scalar_one_or_none()
        if not exists:
            raise HTTPException(status_code=404, detail="Task not found")

    items = []
    for r in rows:
        d = dict(r)
        d["id"] = str(d["id"])
        items.append(d)

    return {"items": items}
