import base64
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .settings import settings
from .celery_client import celery_app

router = APIRouter()

@router.post("/companies/{company_code}/projects/{project_code}/tasks/{task_id}/previews/publish")
async def publish_preview(
    company_code: str,
    project_code: str,
    task_id: str,
    zip_file: UploadFile = File(...),
    title: str = Form("Preview"),
    db: AsyncSession = Depends(get_db),
):
    if not settings.PREVIEW_BASE_URL or not settings.PREVIEW_BUCKET:
        raise HTTPException(status_code=500, detail="PREVIEW_BASE_URL or PREVIEW_BUCKET not configured")

    if not zip_file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="zip_file must be a .zip")

    row = (await db.execute(
        text("SELECT id FROM companies WHERE code=:code LIMIT 1"),
        {"code": company_code},
    )).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Company not found")

    company_id = row["id"]

    prefix = f"{company_code}/{project_code}/{task_id}"
    bucket = settings.PREVIEW_BUCKET
    preview_url = f"{settings.PREVIEW_BASE_URL}/{bucket}/{prefix}/"

    # Create artifact first (PENDING, without celery_task_id yet)
    artifact_row = (await db.execute(text("""
        INSERT INTO artifacts (company_id, type, title, uri, metadata)
        VALUES (:company_id, 'link', :title, :uri,
                jsonb_build_object(
                  'kind','preview',
                  'bucket', to_jsonb(CAST(:bucket AS text)),
                  'prefix', to_jsonb(CAST(:prefix AS text)),
                  'state', 'PENDING'
                )
        )
        RETURNING id, title, uri
    """), {
        "company_id": company_id,
        "title": title,
        "uri": preview_url,
        "bucket": bucket,
        "prefix": prefix,
    })).mappings().first()

    artifact_id = str(artifact_row["id"])

    # enqueue upload
    data = await zip_file.read()
    zip_b64 = base64.b64encode(data).decode("utf-8")
    r = celery_app.send_task("fm.publish_preview_zip", args=[zip_b64, bucket, prefix, artifact_id])

    # store celery_task_id
    await db.execute(text("""
        UPDATE artifacts
        SET metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('celery_task_id', to_jsonb(CAST(:celery_task_id AS text)))
        WHERE id = CAST(:artifact_id AS uuid)
    """), {"celery_task_id": r.id, "artifact_id": artifact_id})

    await db.commit()

    return {
        "artifact": dict(artifact_row),
        "artifact_id": artifact_id,
        "preview_url": preview_url,
        "celery_task_id": r.id,
        "bucket": bucket,
        "prefix": prefix,
    }
