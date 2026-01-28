from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db

router = APIRouter()

@router.get("/integration-providers")
async def list_providers(db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            text("""
                SELECT id, code, name, category, capabilities, created_at
                FROM integration_providers
                ORDER BY category, code
            """)
        )
    ).mappings().all()

    return {"items": [{**dict(r), "id": str(r["id"])} for r in rows]}
