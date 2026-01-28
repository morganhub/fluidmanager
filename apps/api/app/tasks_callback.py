from __future__ import annotations

import hmac
import json
import time
from hashlib import sha256
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db

router = APIRouter()


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CallbackIn(BaseModel):
    status: str = Field(..., pattern="^(done|failed)$")
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None


@router.post("/companies/{company_code}/tasks/{task_id}/callback")
async def task_callback(
    company_code: str,
    task_id: UUID,
    body: CallbackIn,
    request: Request,
    x_fm_timestamp: Optional[str] = Header(None),
    x_fm_signature: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    if not x_fm_timestamp or not x_fm_signature:
        raise HTTPException(status_code=401, detail="Missing X-FM-Timestamp or X-FM-Signature")

    try:
        ts = int(x_fm_timestamp)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid X-FM-Timestamp")

    # Anti-replay: 10 minutes window
    now = int(time.time())
    if abs(now - ts) > 600:
        raise HTTPException(status_code=401, detail="Timestamp expired")

    raw_body = await request.body()
    msg = (str(ts) + ".").encode("utf-8") + raw_body

    # load task + integration secret
    row = (await db.execute(text("""
        SELECT
            t.id,
            t.company_id,
            t.status,
            t.integration_id,
            i.secrets_ref,
            COALESCE(s.secret_json,'{}'::jsonb) AS secret_json
        FROM tasks t
        JOIN companies c ON c.id=t.company_id
        LEFT JOIN integrations i ON i.id = t.integration_id
        LEFT JOIN integration_secrets s ON s.id::text = i.secrets_ref
        WHERE c.code=:company_code
          AND t.id=:task_id
        LIMIT 1
    """), {"company_code": company_code, "task_id": task_id})).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Task not found")

    if not row["integration_id"]:
        raise HTTPException(status_code=409, detail="Task has no integration_id")

    secret = (row["secret_json"] or {}).get("callback_secret")
    if not secret or not isinstance(secret, str):
        raise HTTPException(status_code=409, detail="Missing callback_secret in integration_secrets")

    expected = hmac.new(secret.encode("utf-8"), msg, sha256).hexdigest()
    if not hmac.compare_digest(expected, x_fm_signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Transition rules
    if row["status"] in ("done", "failed", "canceled"):
        raise HTTPException(status_code=409, detail=f"Task already finished: {row['status']}")

    finished_at = _utc_iso()
    new_status = "done" if body.status == "done" else "failed"
    last_error = body.error if new_status == "failed" else None

    async with db.begin():
        await db.execute(text("""
            UPDATE tasks
            SET status=:status,
                last_error = CASE WHEN :last_error IS NULL THEN last_error ELSE :last_error END,
                runtime_json = COALESCE(runtime_json,'{}'::jsonb)
                    || jsonb_build_object(
                        'finished_at', to_jsonb(CAST(:finished_at AS text)),
                        'callback', CAST(:callback_json AS jsonb)
                    )
            WHERE id=:task_id
        """), {
            "status": new_status,
            "last_error": last_error,
            "finished_at": finished_at,
            "callback_json": json.dumps({
                "status": body.status,
                "result": body.result,
                "error": body.error,
                "ts": finished_at,
            }),
            "task_id": task_id,
        })

        # events
        await db.execute(text("""
            INSERT INTO task_events (company_id, task_id, event_type, actor_type, payload)
            VALUES (:company_id, :task_id, 'callback_received', 'integration', CAST(:payload AS jsonb))
        """), {
            "company_id": row["company_id"],
            "task_id": task_id,
            "payload": json.dumps({
                "status": body.status,
                "ts": finished_at,
            }),
        })

        await db.execute(text("""
            INSERT INTO task_events (company_id, task_id, event_type, actor_type, payload)
            VALUES (:company_id, :task_id, :event_type, 'system', CAST(:payload AS jsonb))
        """), {
            "company_id": row["company_id"],
            "task_id": task_id,
            "event_type": "task_done" if new_status == "done" else "task_failed",
            "payload": json.dumps({
                "ts": finished_at,
                "error": body.error,
            }),
        })

    return {"ok": True, "task_id": str(task_id), "status": new_status}
