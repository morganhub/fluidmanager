"""
Admin Blueprints CRUD API
Superadmin-only endpoints for managing employee blueprints
"""

import json
from datetime import datetime
from typing import Optional, Union
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .auth import require_superadmin

router = APIRouter(prefix="/admin/blueprints", tags=["admin-blueprints"])


# =============================================================================
# Helper Functions
# =============================================================================

def normalize_localized_text(value: Union[str, dict, None], default_locale: str = "fr") -> dict:
    """
    Normalize a localized text value to a dict format.
    - If string: convert to {"fr": value, "en": ""}
    - If dict: return as-is
    - If None: return empty structure
    """
    if value is None:
        return {"fr": "", "en": ""}
    if isinstance(value, str):
        return {default_locale: value, "en": "" if default_locale == "fr" else ""}
    return value


# =============================================================================
# Pydantic Models
# =============================================================================


class WebhooksConfig(BaseModel):
    review: Optional[str] = None
    meeting: Optional[str] = None
    task: Optional[str] = None


# Type alias for localized text: {"fr": "...", "en": "..."}
LocalizedText = dict[str, str]


class BlueprintCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=50)
    # Role can be string (backward compat) or LocalizedText dict
    role: LocalizedText | str = Field(default={"fr": "", "en": ""})
    level: str = Field(default="N-2", pattern="^(N|N-1|N-2)$")
    default_first_name: str = Field(default="", max_length=100)
    default_last_name: str = Field(default="", max_length=100)
    # Bio can be string (backward compat) or LocalizedText dict
    default_bio: Optional[LocalizedText | str] = Field(default={"fr": "", "en": ""})
    default_portrait_id: Optional[str] = None
    skills: list[str] = Field(default_factory=list)
    # System prompt can be string (backward compat) or LocalizedText dict
    system_prompt: LocalizedText | str = Field(default={"fr": "", "en": ""})
    webhooks: WebhooksConfig = Field(default_factory=WebhooksConfig)
    is_active: bool = True
    parent_blueprint_ids: list[str] = Field(default_factory=list)  # For N-2: their N-1 managers
    child_blueprint_ids: list[str] = Field(default_factory=list)   # For N-1: their N-2 subordinates


class BlueprintUpdate(BaseModel):
    code: Optional[str] = Field(None, min_length=2, max_length=50)
    role: Optional[LocalizedText | str] = None
    level: Optional[str] = Field(None, pattern="^(N|N-1|N-2)$")
    default_first_name: Optional[str] = Field(None, max_length=100)
    default_last_name: Optional[str] = Field(None, max_length=100)
    default_bio: Optional[LocalizedText | str] = None
    default_portrait_id: Optional[str] = None
    skills: Optional[list[str]] = None
    system_prompt: Optional[LocalizedText | str] = None
    webhooks: Optional[WebhooksConfig] = None
    is_active: Optional[bool] = None
    parent_blueprint_ids: Optional[list[str]] = None
    child_blueprint_ids: Optional[list[str]] = None


class BlueprintResponse(BaseModel):
    id: str
    code: str
    role: LocalizedText  # Always return as LocalizedText dict
    level: str
    default_first_name: str
    default_last_name: str
    default_bio: LocalizedText  # Always return as LocalizedText dict
    default_portrait_id: Optional[str]
    default_portrait_uri: Optional[str]
    skills: list[str]
    system_prompt: LocalizedText  # Always return as LocalizedText dict
    webhooks: dict
    is_active: bool
    parent_blueprints: list[dict]  # [{id, code, role}]
    child_blueprints: list[dict]   # [{id, code, role}]
    created_at: datetime
    updated_at: datetime



class BlueprintListResponse(BaseModel):
    items: list[BlueprintResponse]
    total: int
    page: int
    page_size: int


# =============================================================================
# Endpoints
# =============================================================================

@router.get("", response_model=BlueprintListResponse)
async def list_blueprints(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    level: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_superadmin)
):
    """List all blueprints with pagination and filters."""
    offset = (page - 1) * page_size
    
    # Build WHERE clause
    conditions = []
    params = {"limit": page_size, "offset": offset}
    
    if search:
        conditions.append("(b.code ILIKE :search OR b.role ILIKE :search OR b.default_first_name ILIKE :search OR b.default_last_name ILIKE :search)")
        params["search"] = f"%{search}%"
    
    if level:
        conditions.append("b.level = CAST(:level AS blueprint_level)")
        params["level"] = level
    
    if is_active is not None:
        conditions.append("b.is_active = :is_active")
        params["is_active"] = is_active
    
    where_clause = " AND ".join(conditions) if conditions else "TRUE"
    
    # Count total
    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM blueprints b WHERE {where_clause}"),
        params
    )
    total = count_result.scalar()
    
    # Fetch blueprints
    result = await db.execute(
        text(f"""
            SELECT 
                b.id, b.code, b.role, b.level::text, 
                b.default_first_name, b.default_last_name, b.default_bio,
                b.default_portrait_id::text, p.uri as portrait_uri,
                b.skills, b.system_prompt, b.webhooks,
                b.is_active, b.created_at, b.updated_at
            FROM blueprints b
            LEFT JOIN portrait_library p ON p.id = b.default_portrait_id
            WHERE {where_clause}
            ORDER BY b.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params
    )
    rows = result.mappings().all()
    
    # Fetch relations for each blueprint
    items = []
    for row in rows:
        blueprint_id = str(row["id"])
        
        # Get parent blueprints (N-1 managers for this N-2)
        parents_result = await db.execute(
            text("""
                SELECT bp.id::text, bp.code, bp.role 
                FROM blueprint_relations br
                JOIN blueprints bp ON bp.id = br.parent_blueprint_id
                WHERE br.child_blueprint_id = :id
            """),
            {"id": blueprint_id}
        )
        parents = [dict(r) for r in parents_result.mappings().all()]
        
        # Get child blueprints (N-2 subordinates for this N-1)
        children_result = await db.execute(
            text("""
                SELECT bp.id::text, bp.code, bp.role 
                FROM blueprint_relations br
                JOIN blueprints bp ON bp.id = br.child_blueprint_id
                WHERE br.parent_blueprint_id = :id
            """),
            {"id": blueprint_id}
        )
        children = [dict(r) for r in children_result.mappings().all()]
        
        items.append(BlueprintResponse(
            id=blueprint_id,
            code=row["code"],
            role=row["role"],
            level=row["level"],
            default_first_name=row["default_first_name"],
            default_last_name=row["default_last_name"],
            default_bio=row["default_bio"],
            default_portrait_id=row["default_portrait_id"],
            default_portrait_uri=row["portrait_uri"],
            skills=row["skills"] or [],
            system_prompt=row["system_prompt"],
            webhooks=row["webhooks"] or {},
            is_active=row["is_active"],
            parent_blueprints=parents,
            child_blueprints=children,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        ))
    
    return BlueprintListResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=BlueprintResponse, status_code=status.HTTP_201_CREATED)
async def create_blueprint(
    data: BlueprintCreate,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_superadmin)
):
    """Create a new blueprint."""
    # Check code uniqueness
    existing = await db.execute(
        text("SELECT id FROM blueprints WHERE code = :code"),
        {"code": data.code}
    )
    if existing.first():
        raise HTTPException(status_code=400, detail="Blueprint code already exists")
    
    # Normalize localized text fields
    role_data = normalize_localized_text(data.role)
    bio_data = normalize_localized_text(data.default_bio)
    prompt_data = normalize_localized_text(data.system_prompt)
    
    # Insert blueprint
    try:
        result = await db.execute(
            text("""
                INSERT INTO blueprints (
                    code, role, level, default_first_name, default_last_name,
                    default_bio, default_portrait_id, skills, system_prompt, webhooks, is_active
                ) VALUES (
                    :code, CAST(:role AS jsonb), CAST(:level AS blueprint_level), :first_name, :last_name,
                    CAST(:bio AS jsonb), CAST(:portrait_id AS uuid), CAST(:skills AS text[]), CAST(:prompt AS jsonb), CAST(:webhooks AS jsonb), :is_active
                )
                RETURNING id, created_at, updated_at
            """),
            {
                "code": data.code,
                "role": json.dumps(role_data),
                "level": data.level,
                "first_name": data.default_first_name,
                "last_name": data.default_last_name,
                "bio": json.dumps(bio_data),
                "portrait_id": data.default_portrait_id,
                "skills": data.skills,
                "prompt": json.dumps(prompt_data),
                "webhooks": data.webhooks.model_dump_json(),
                "is_active": data.is_active,
            }
        )

        row = result.mappings().first()
        blueprint_id = str(row["id"])
        
        # Create parent relations (for N-2 blueprints)
        for parent_id in data.parent_blueprint_ids:
            await db.execute(
                text("""
                    INSERT INTO blueprint_relations (parent_blueprint_id, child_blueprint_id)
                    VALUES (CAST(:parent_id AS uuid), CAST(:child_id AS uuid))
                    ON CONFLICT DO NOTHING
                """),
                {"parent_id": parent_id, "child_id": blueprint_id}
            )
        
        # Create child relations (for N-1 blueprints)
        for child_id in data.child_blueprint_ids:
            await db.execute(
                text("""
                    INSERT INTO blueprint_relations (parent_blueprint_id, child_blueprint_id)
                    VALUES (CAST(:parent_id AS uuid), CAST(:child_id AS uuid))
                    ON CONFLICT DO NOTHING
                """),
                {"parent_id": blueprint_id, "child_id": child_id}
            )
        
        await db.commit()
    except Exception as e:
        await db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")
    
    # Fetch portrait URI if set
    portrait_uri = None
    if data.default_portrait_id:
        p_result = await db.execute(
            text("SELECT uri FROM portrait_library WHERE id = CAST(:id AS uuid)"),
            {"id": data.default_portrait_id}
        )
        p_row = p_result.first()
        if p_row:
            portrait_uri = p_row[0]
    
    return BlueprintResponse(
        id=blueprint_id,
        code=data.code,
        role=data.role,
        level=data.level,
        default_first_name=data.default_first_name,
        default_last_name=data.default_last_name,
        default_bio=data.default_bio,
        default_portrait_id=data.default_portrait_id,
        default_portrait_uri=portrait_uri,
        skills=data.skills,
        system_prompt=data.system_prompt,
        webhooks=data.webhooks.model_dump(),
        is_active=data.is_active,
        parent_blueprints=[],
        child_blueprints=[],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("/{blueprint_id}", response_model=BlueprintResponse)
async def get_blueprint(
    blueprint_id: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_superadmin)
):
    """Get a single blueprint by ID."""
    result = await db.execute(
        text("""
            SELECT 
                b.id, b.code, b.role, b.level::text, 
                b.default_first_name, b.default_last_name, b.default_bio,
                b.default_portrait_id::text, p.uri as portrait_uri,
                b.skills, b.system_prompt, b.webhooks,
                b.is_active, b.created_at, b.updated_at
            FROM blueprints b
            LEFT JOIN portrait_library p ON p.id = b.default_portrait_id
            WHERE b.id = CAST(:id AS uuid)
        """),
        {"id": blueprint_id}
    )
    row = result.mappings().first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    
    # Get relations
    parents_result = await db.execute(
        text("""
            SELECT bp.id::text, bp.code, bp.role 
            FROM blueprint_relations br
            JOIN blueprints bp ON bp.id = br.parent_blueprint_id
            WHERE br.child_blueprint_id = CAST(:id AS uuid)
        """),
        {"id": blueprint_id}
    )
    parents = [dict(r) for r in parents_result.mappings().all()]
    
    children_result = await db.execute(
        text("""
            SELECT bp.id::text, bp.code, bp.role 
            FROM blueprint_relations br
            JOIN blueprints bp ON bp.id = br.child_blueprint_id
            WHERE br.parent_blueprint_id = CAST(:id AS uuid)
        """),
        {"id": blueprint_id}
    )
    children = [dict(r) for r in children_result.mappings().all()]
    
    return BlueprintResponse(
        id=str(row["id"]),
        code=row["code"],
        role=row["role"],
        level=row["level"],
        default_first_name=row["default_first_name"],
        default_last_name=row["default_last_name"],
        default_bio=row["default_bio"],
        default_portrait_id=row["default_portrait_id"],
        default_portrait_uri=row["portrait_uri"],
        skills=row["skills"] or [],
        system_prompt=row["system_prompt"],
        webhooks=row["webhooks"] or {},
        is_active=row["is_active"],
        parent_blueprints=parents,
        child_blueprints=children,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.put("/{blueprint_id}", response_model=BlueprintResponse)
async def update_blueprint(
    blueprint_id: str,
    data: BlueprintUpdate,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_superadmin)
):
    """Update a blueprint."""
    # Check exists
    existing = await db.execute(
        text("SELECT id FROM blueprints WHERE id = CAST(:id AS uuid)"),
        {"id": blueprint_id}
    )
    if not existing.first():
        raise HTTPException(status_code=404, detail="Blueprint not found")
    
    # Check code uniqueness if changing
    if data.code:
        code_check = await db.execute(
            text("SELECT id FROM blueprints WHERE code = :code AND id != CAST(:id AS uuid)"),
            {"code": data.code, "id": blueprint_id}
        )
        if code_check.first():
            raise HTTPException(status_code=400, detail="Blueprint code already exists")
    
    # Build update query
    update_fields = []
    params = {"id": blueprint_id}
    
    if data.code is not None:
        update_fields.append("code = :code")
        params["code"] = data.code
    if data.role is not None:
        update_fields.append("role = CAST(:role AS jsonb)")
        params["role"] = json.dumps(normalize_localized_text(data.role))
    if data.level is not None:
        update_fields.append("level = CAST(:level AS blueprint_level)")
        params["level"] = data.level
    if data.default_first_name is not None:
        update_fields.append("default_first_name = :first_name")
        params["first_name"] = data.default_first_name
    if data.default_last_name is not None:
        update_fields.append("default_last_name = :last_name")
        params["last_name"] = data.default_last_name
    if data.default_bio is not None:
        update_fields.append("default_bio = CAST(:bio AS jsonb)")
        params["bio"] = json.dumps(normalize_localized_text(data.default_bio))
    if data.default_portrait_id is not None:
        update_fields.append("default_portrait_id = CAST(:portrait_id AS uuid)")
        params["portrait_id"] = data.default_portrait_id if data.default_portrait_id else None
    if data.skills is not None:
        update_fields.append("skills = CAST(:skills AS text[])")
        params["skills"] = data.skills
    if data.system_prompt is not None:
        update_fields.append("system_prompt = CAST(:prompt AS jsonb)")
        params["prompt"] = json.dumps(normalize_localized_text(data.system_prompt))
    if data.webhooks is not None:
        update_fields.append("webhooks = CAST(:webhooks AS jsonb)")
        params["webhooks"] = data.webhooks.model_dump_json()

    if data.is_active is not None:
        update_fields.append("is_active = :is_active")
        params["is_active"] = data.is_active
    
    if update_fields:
        await db.execute(
            text(f"UPDATE blueprints SET {', '.join(update_fields)} WHERE id = CAST(:id AS uuid)"),
            params
        )
    
    # Update relations if provided
    if data.parent_blueprint_ids is not None:
        await db.execute(
            text("DELETE FROM blueprint_relations WHERE child_blueprint_id = CAST(:id AS uuid)"),
            {"id": blueprint_id}
        )
        for parent_id in data.parent_blueprint_ids:
            await db.execute(
                text("""
                    INSERT INTO blueprint_relations (parent_blueprint_id, child_blueprint_id)
                    VALUES (CAST(:parent_id AS uuid), CAST(:child_id AS uuid))
                    ON CONFLICT DO NOTHING
                """),
                {"parent_id": parent_id, "child_id": blueprint_id}
            )
    
    if data.child_blueprint_ids is not None:
        await db.execute(
            text("DELETE FROM blueprint_relations WHERE parent_blueprint_id = CAST(:id AS uuid)"),
            {"id": blueprint_id}
        )
        for child_id in data.child_blueprint_ids:
            await db.execute(
                text("""
                    INSERT INTO blueprint_relations (parent_blueprint_id, child_blueprint_id)
                    VALUES (CAST(:parent_id AS uuid), CAST(:child_id AS uuid))
                    ON CONFLICT DO NOTHING
                """),
                {"parent_id": blueprint_id, "child_id": child_id}
            )
    
    await db.commit()
    
    # Return updated blueprint
    return await get_blueprint(blueprint_id, db, _user)


@router.delete("/{blueprint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_blueprint(
    blueprint_id: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_superadmin)
):
    """Delete a blueprint (soft delete by setting is_active=false)."""
    result = await db.execute(
        text("UPDATE blueprints SET is_active = false WHERE id = CAST(:id AS uuid) RETURNING id"),
        {"id": blueprint_id}
    )
    if not result.first():
        raise HTTPException(status_code=404, detail="Blueprint not found")
    
    await db.commit()
