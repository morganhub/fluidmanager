from fastapi import FastAPI, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
import os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .settings import settings
from .security import JWTAuthMiddleware
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="fluidmanager API", version="0.1.0")

# Ensure portrait upload directory exists
PORTRAIT_DIR = "/tmp/portraits"
os.makedirs(PORTRAIT_DIR, exist_ok=True)

# Mount static files for portraits
app.mount("/static/portraits", StaticFiles(directory=PORTRAIT_DIR), name="portraits")

app.add_middleware(JWTAuthMiddleware)
# CORS middleware (must be added before auth middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JWT Authentication middleware


# =============================================================================
# Auth & Admin Routers
# =============================================================================
from .auth import router as auth_router
app.include_router(auth_router)

from .admin_users import router as admin_users_router
app.include_router(admin_users_router)

from .admin_companies import router as admin_companies_router
app.include_router(admin_companies_router)

from .admin_blueprints import router as admin_blueprints_router
app.include_router(admin_blueprints_router)

from .admin_portraits import router as admin_portraits_router
app.include_router(admin_portraits_router)

from .org_chart import router as org_chart_router
app.include_router(org_chart_router)

# =============================================================================
# Existing Routers
# =============================================================================
from .previews import router as previews_router
app.include_router(previews_router)

from .tasks_control import router as tasks_control_router
app.include_router(tasks_control_router)

from .tasks_run import router as tasks_run_router
app.include_router(tasks_run_router)

from .artifacts import router as artifacts_router
app.include_router(artifacts_router)

from .tasks_create import router as tasks_create_router
app.include_router(tasks_create_router)

from .tasks_list import router as tasks_list_router
app.include_router(tasks_list_router)

from .tasks_events import router as tasks_events_router
app.include_router(tasks_events_router)

from .integrations import router as integrations_router
app.include_router(integrations_router)

from .tasks_dependencies import router as tasks_dependencies_router
app.include_router(tasks_dependencies_router)

from .tasks_callback import router as tasks_callback_router
app.include_router(tasks_callback_router)



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
    out = {"task_id": task_id, "state": r.state}
    if r.successful():
        out["result"] = r.result
    elif r.failed():
        out["error"] = str(r.result)
    return out
