from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db

router = APIRouter()


@router.get("/companies/{company_code}/projects/{project_code}/tasks")
async def list_tasks(
    company_code: str,
    project_code: str,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    # company
    company = (await db.execute(text("""
        SELECT id FROM companies WHERE code=:company_code LIMIT 1
    """), {"company_code": company_code})).mappings().first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # project (optional: si project_code doit exister, mets 404 si absent)
    project = (await db.execute(text("""
        SELECT id FROM projects WHERE code=:project_code AND company_id=:company_id LIMIT 1
    """), {"project_code": project_code, "company_id": company["id"]})).mappings().first()

    project_id = project["id"] if project else None

    rows = (await db.execute(text("""
        SELECT
            t.id, t.title, t.status, t.priority,
            t.created_at, t.deadline_at,
            t.attempt_count, t.max_attempts,
            t.runtime_json, t.control_json
        FROM tasks t
        WHERE t.company_id=:company_id
          AND (:project_id::uuid IS NULL OR t.project_id=:project_id)
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT :limit
    """), {"company_id": company["id"], "project_id": project_id, "limit": limit})).mappings().all()

    return {"items": [{**dict(r), "id": str(r["id"])} for r in rows]}
