from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db

router = APIRouter()

@router.get("/companies/{company_code}/artifacts/{artifact_id}")
async def get_artifact(company_code: str, artifact_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(text("""
        SELECT a.id, a.type, a.title, a.uri, a.metadata, a.created_at
        FROM artifacts a
        JOIN companies c ON c.id = a.company_id
        WHERE c.code = :company_code
          AND a.id = CAST(:artifact_id AS uuid)
        LIMIT 1
    """), {"company_code": company_code, "artifact_id": artifact_id})).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Artifact not found")

    return dict(row)


@router.get("/companies/{company_code}/artifacts")
async def list_artifacts(company_code: str, limit: int = 50, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(text("""
        SELECT a.id, a.type, a.title, a.uri, a.metadata, a.created_at
        FROM artifacts a
        JOIN companies c ON c.id = a.company_id
        WHERE c.code = :company_code
        ORDER BY a.created_at DESC
        LIMIT :limit
    """), {"company_code": company_code, "limit": max(1, min(limit, 200))})).mappings().all()

    return {"items": [dict(r) for r in rows]}


@router.get("/companies/{company_code}/projects/{project_code}/tasks/{task_id}/previews")
async def list_task_previews(company_code: str, project_code: str, task_id: str, db: AsyncSession = Depends(get_db)):
    prefix = f"{company_code}/{project_code}/{task_id}"

    rows = (await db.execute(text("""
        SELECT a.id, a.title, a.uri, a.metadata, a.created_at
        FROM artifacts a
        JOIN companies c ON c.id = a.company_id
        WHERE c.code = :company_code
          AND a.metadata->>'kind' = 'preview'
          AND a.metadata->>'prefix' = :prefix
        ORDER BY a.created_at DESC
        LIMIT 50
    """), {"company_code": company_code, "prefix": prefix})).mappings().all()

    return {"items": [dict(r) for r in rows], "prefix": prefix}
