import os
import psycopg

def _sync_dsn() -> str:
    """
    Convert SQLAlchemy URL -> psycopg DSN if needed.
    Example: postgresql+asyncpg://user:pass@host:5432/db
         ->  postgresql://user:pass@host:5432/db
    """
    url = os.environ["DATABASE_URL"]
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    return url

def update_artifact_metadata(artifact_id: str, patch: dict) -> None:
    """
    Patch artifacts.metadata with jsonb merge:
      metadata = coalesce(metadata,'{}') || patch
    """
    dsn = _sync_dsn()
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE artifacts
                SET metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb
                WHERE id = %s::uuid
                """,
                (psycopg.types.json.Json(patch), artifact_id),
            )
        conn.commit()

def get_task_status(company_code: str, task_id: str) -> str | None:
    dsn = _sync_dsn()
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT t.status
                FROM tasks t
                JOIN companies c ON c.id=t.company_id
                WHERE c.code=%s AND t.id=%s::uuid
                LIMIT 1
                """,
                (company_code, task_id),
            )
            row = cur.fetchone()
            return row[0] if row else None

def get_task_control(company_code: str, task_id: str) -> dict | None:
    dsn = _sync_dsn()
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COALESCE(t.control_json,'{}'::jsonb)
                FROM tasks t
                JOIN companies c ON c.id=t.company_id
                WHERE c.code=%s AND t.id=%s::uuid
                LIMIT 1
                """,
                (company_code, task_id),
            )
            row = cur.fetchone()
            return row[0] if row else None
