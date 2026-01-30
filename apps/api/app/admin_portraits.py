"""
Admin Portrait Library API
Endpoints for managing portrait images (upload, list, delete)
"""

import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .auth import require_superadmin, get_current_user
from .settings import settings

router = APIRouter(prefix="/admin/portraits", tags=["admin-portraits"])


# =============================================================================
# Pydantic Models
# =============================================================================

class PortraitResponse(BaseModel):
    id: str
    filename: str
    uri: str
    uploaded_by: Optional[str]
    created_at: datetime


class PortraitListResponse(BaseModel):
    items: list[PortraitResponse]
    total: int


# =============================================================================
# Helper Functions
# =============================================================================

def get_upload_dir() -> str:
    """Get the directory for portrait uploads."""
    upload_dir = getattr(settings, "PORTRAIT_UPLOAD_DIR", "/tmp/portraits")
    os.makedirs(upload_dir, exist_ok=True)
    return upload_dir


def get_portrait_url(filename: str) -> str:
    """Get the public URL for a portrait."""
    base_url = getattr(settings, "PORTRAIT_BASE_URL", "/static/portraits")
    return f"{base_url}/{filename}"


# =============================================================================
# Endpoints
# =============================================================================

@router.get("", response_model=PortraitListResponse)
async def list_portraits(
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user)
):
    """List all available portraits."""
    params = {}
    where_clause = "TRUE"
    
    if search:
        where_clause = "p.filename ILIKE :search"
        params["search"] = f"%{search}%"
    
    # Count
    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM portrait_library p WHERE {where_clause}"),
        params
    )
    total = count_result.scalar()
    
    # Fetch
    result = await db.execute(
        text(f"""
            SELECT p.id::text, p.filename, p.uri, p.uploaded_by::text, p.created_at
            FROM portrait_library p
            WHERE {where_clause}
            ORDER BY p.created_at DESC
        """),
        params
    )
    rows = result.mappings().all()
    
    items = [
        PortraitResponse(
            id=row["id"],
            filename=row["filename"],
            uri=row["uri"],
            uploaded_by=row["uploaded_by"],
            created_at=row["created_at"],
        )
        for row in rows
    ]
    
    return PortraitListResponse(items=items, total=total)


@router.post("", response_model=PortraitResponse, status_code=status.HTTP_201_CREATED)
async def upload_portrait(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_superadmin)
):
    """Upload a new portrait image."""
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_types)}"
        )
    
    # Validate file size (max 5MB)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 5MB.")
    
    # Generate unique filename
    ext = os.path.splitext(file.filename or "image.png")[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        ext = ".png"
    unique_filename = f"{uuid.uuid4()}{ext}"
    
    # Save file
    upload_dir = get_upload_dir()
    file_path = os.path.join(upload_dir, unique_filename)
    
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Get public URI
    uri = get_portrait_url(unique_filename)
    
    # Insert into database
    result = await db.execute(
        text("""
            INSERT INTO portrait_library (filename, uri, uploaded_by)
            VALUES (:filename, :uri, CAST(:uploaded_by AS uuid))
            RETURNING CAST(id AS text), created_at
        """),
        {
            "filename": file.filename or unique_filename,
            "uri": uri,
            "uploaded_by": user["id"],
        }
    )
    row = result.mappings().first()
    await db.commit()
    
    return PortraitResponse(
        id=row["id"],
        filename=file.filename or unique_filename,
        uri=uri,
        uploaded_by=user["id"],
        created_at=row["created_at"],
    )


@router.delete("/{portrait_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_portrait(
    portrait_id: str,
    force: bool = Query(False, description="Force delete even if in use"),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_superadmin)
):
    """Delete a portrait from the library."""
    # Get portrait info
    result = await db.execute(
        text("SELECT uri FROM portrait_library WHERE id = CAST(:id AS uuid)"),
        {"id": portrait_id}
    )
    row = result.first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Portrait not found")
    
    # Check if portrait is in use (skip if force=true)
    if not force:
        usage_check = await db.execute(
            text("""
                SELECT COUNT(*) FROM (
                    SELECT 1 FROM blueprints WHERE default_portrait_id = CAST(:id AS uuid)
                    UNION ALL
                    SELECT 1 FROM agents WHERE portrait_id = CAST(:id AS uuid)
                ) usage
            """),
            {"id": portrait_id}
        )
        if usage_check.scalar() > 0:
            raise HTTPException(
                status_code=400,
                detail="Portrait is in use and cannot be deleted"
            )
    
    # If force and in use, clear references first
    if force:
        await db.execute(
            text("UPDATE blueprints SET default_portrait_id = NULL WHERE default_portrait_id = CAST(:id AS uuid)"),
            {"id": portrait_id}
        )
        await db.execute(
            text("UPDATE agents SET portrait_id = NULL WHERE portrait_id = CAST(:id AS uuid)"),
            {"id": portrait_id}
        )
    
    # Delete from database
    await db.execute(
        text("DELETE FROM portrait_library WHERE id = CAST(:id AS uuid)"),
        {"id": portrait_id}
    )
    await db.commit()
    
    # Try to delete file from disk (best-effort, don't fail if file missing)
    try:
        uri = row[0]
        filename = os.path.basename(uri)
        file_path = os.path.join(get_upload_dir(), filename)
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception:
        pass  # File cleanup is best-effort
