from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .settings import settings
from .security import ApiKeyASGIMiddleware

app = FastAPI(title="fluidmanager API", version="0.1.0")
app.add_middleware(ApiKeyASGIMiddleware, api_key=settings.API_ADMIN_KEY, public_paths={"/health"})

from .previews import router as previews_router
app.include_router(previews_router)

from .tasks_control import router as tasks_control_router
app.include_router(tasks_control_router)

from .tasks_run import router as tasks_run_router
app.include_router(tasks_run_router)

from .artifacts import router as artifacts_router
app.include_router(artifacts_router)


@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/db/ping")
async def db_ping(db: AsyncSession = Depends(get_db)):
    r = await db.execute(text("SELECT 1 AS ok;"))
    return {"ok": r.scalar_one()}

@app.get("/companies")
async def list_companies(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(text("""
        SELECT id, code, name
        FROM companies
        ORDER BY created_at DESC
        LIMIT 50
    """))).mappings().all()
    return {"items": list(rows)}

@app.get("/companies/{company_code}/artifacts")
async def list_artifacts(company_code: str, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(text("""
        SELECT a.id, a.type, a.title, a.uri, a.created_at
        FROM artifacts a
        JOIN companies c ON c.id = a.company_id
        WHERE c.code = :company_code
        ORDER BY a.created_at DESC
        LIMIT 100
    """), {"company_code": company_code})).mappings().all()

    # si company inconnue, mieux de check séparément (v1)
    return {"items": list(rows)}

from pydantic import BaseModel
from celery.result import AsyncResult
from .celery_client import celery_app

class EchoIn(BaseModel):
    message: str

@app.post("/jobs/echo")
async def job_echo(payload: EchoIn):
    r = celery_app.send_task("fm.echo", args=[payload.message])
    return {"task_id": r.id}

@app.get("/jobs/{task_id}")
async def job_status(task_id: str):
    r = AsyncResult(task_id, app=celery_app)
    # states: PENDING, STARTED, SUCCESS, FAILURE, RETRY
    out = {"task_id": task_id, "state": r.state}
    if r.successful():
        out["result"] = r.result
    elif r.failed():
        out["error"] = str(r.result)
    return out
