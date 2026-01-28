from __future__ import annotations

import json
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db

router = APIRouter()


class TaskPriority(str, Enum):
    low = "low"
    normal = "normal"
    high = "high"
    urgent = "urgent"


class CreateTaskIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    max_attempts: int = Field(5, ge=1, le=50)
    priority: TaskPriority = TaskPriority.normal
    deadline_at: Optional[datetime] = None

    job_type: Optional[str] = Field(None, min_length=1)
    payload: dict[str, Any] = Field(default_factory=dict)


class CreateTaskOut(BaseModel):
    company_code: str
    project_code: str
    task: dict[str, Any]


@router.post(
    "/companies/{company_code}/projects/{project_code}/tasks",
    response_model=CreateTaskOut,
)
async def create_task(
    company_code: str,
    project_code: str,
    body: CreateTaskIn,
    db: AsyncSession = Depends(get_db),
):
    runtime_patch: dict[str, Any] = {}
    if body.job_type:
        runtime_patch = {"job_type": body.job_type, "job_payload": body.payload}

    try:
        # 1) company (required)
        company = (
            await db.execute(
                text(
                    """
                    SELECT id
                    FROM companies
                    WHERE code = :company_code
                    LIMIT 1
                    """
                ),
                {"company_code": company_code},
            )
        ).mappings().first()

        if not company:
            raise HTTPException(status_code=404, detail="Company not found")

        # 2) project (optional)
        project = (
            await db.execute(
                text("""
                    SELECT p.id
                    FROM projects p
                    WHERE p.code = :project_code
                    AND p.company_id = :company_id
                    LIMIT 1
                """),
                {"project_code": project_code, "company_id": company["id"]},
            )
        ).mappings().first()

        project_id = project["id"] if project else None

        # 3) insert task
        row = (
            await db.execute(
                text(
                    """
                    INSERT INTO tasks (
                        company_id,
                        project_id,
                        title,
                        status,
                        attempt_count,
                        max_attempts,
                        priority,
                        deadline_at,
                        control_json,
                        runtime_json
                    )
                    VALUES (
                        :company_id,
                        :project_id,
                        :title,
                        'queued',
                        0,
                        :max_attempts,
                        CAST(:priority AS task_priority),
                        :deadline_at,
                        jsonb_build_object('pause', false, 'cancel', false),
                        CAST(:runtime_json AS jsonb)
                    )
                    RETURNING
                        id,
                        company_id,
                        project_id,
                        title,
                        status,
                        attempt_count,
                        max_attempts,
                        priority,
                        created_at,
                        deadline_at,
                        control_json,
                        runtime_json
                    """
                ),
                {
                    "company_id": company["id"],
                    "project_id": project_id,
                    "title": body.title,
                    "max_attempts": int(body.max_attempts),
                    "priority": body.priority.value,  # <= enum string
                    "deadline_at": body.deadline_at,
                    "runtime_json": json.dumps(runtime_patch),
                },
            )
        ).mappings().first()

        # 4) event (UI-friendly)
        await db.execute(
            text(
                """
                INSERT INTO task_events (company_id, task_id, event_type, actor_type, payload)
                VALUES (:company_id, :task_id, 'task_created', 'system', CAST(:payload AS jsonb))
                """
            ),
            {
                "company_id": company["id"],
                "task_id": row["id"],
                "payload": json.dumps(
                    {
                        "title": body.title,
                        "project_code": project_code if project_id else None,
                    }
                ),
            },
        )

        await db.commit()

        return {
            "company_code": company_code,
            "project_code": project_code,
            "task": {
                **dict(row),
                "id": str(row["id"]),
                "company_id": str(row["company_id"]),
                "project_id": str(row["project_id"]) if row["project_id"] else None,
            },
        }

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        # utile pour debug côté curl (sinon "Internal Server Error" opaque)
        raise HTTPException(status_code=500, detail=f"create_task failed: {e}")
