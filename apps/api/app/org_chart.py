"""
Organization Chart API
Company-scoped endpoints for managers to manage their org chart and employees.
"""

import json
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .auth import get_current_user, require_company_access

router = APIRouter(prefix="/companies/{company_id}", tags=["org-chart"])


# =============================================================================
# Pydantic Models
# =============================================================================

# Localized text helper
LocalizedText = dict[str, str]


class PositionResponse(BaseModel):
    id: str
    level: str  # MANAGER, N, N-1, N-2
    position_index: int
    parent_position_id: Optional[str] = None


class EmployeeResponse(BaseModel):
    id: str
    position_id: str
    blueprint_id: Optional[str] = None
    first_name: str
    last_name: str
    bio: LocalizedText
    portrait_id: Optional[str] = None
    portrait_uri: Optional[str] = None
    skills: list[str]
    email: Optional[str] = None
    phone: Optional[str] = None
    is_removable: bool
    # From blueprint (readonly)
    role: Optional[LocalizedText] = None
    level: Optional[str] = None


class OrgChartResponse(BaseModel):
    """Full org chart with positions and employees."""
    company_id: str
    positions: list[PositionResponse]
    employees: dict[str, EmployeeResponse]  # position_id -> employee


class AvailableBlueprintResponse(BaseModel):
    id: str
    code: str
    role: LocalizedText
    level: str
    default_first_name: str
    default_last_name: str
    default_bio: LocalizedText
    portrait_id: Optional[str] = None
    portrait_uri: Optional[str] = None
    skills: list[str]
    already_hired_count: int  # How many times this blueprint is used in this company


class AvailableBlueprintsListResponse(BaseModel):
    items: list[AvailableBlueprintResponse]
    total: int


class RecruitRequest(BaseModel):
    position_id: str
    blueprint_id: str
    first_name: Optional[str] = None  # Override default
    last_name: Optional[str] = None   # Override default


class EmployeeUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    bio: Optional[LocalizedText] = None
    portrait_id: Optional[str] = None
    skills: Optional[list[str]] = None
    email: Optional[str] = None
    phone: Optional[str] = None


# =============================================================================
# Helper Functions
# =============================================================================

def normalize_localized_text(value) -> dict:
    """Ensure value is a proper LocalizedText dict."""
    if value is None:
        return {"fr": "", "en": ""}
    if isinstance(value, str):
        return {"fr": value, "en": ""}
    return dict(value)


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/org-chart", response_model=OrgChartResponse)
async def get_org_chart(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Get the full organization chart for a company."""
    # Check access (user must have access to this company)
    await require_company_access(user, company_id, db)
    
    # Get all positions
    positions_result = await db.execute(
        text("""
            SELECT id, level::text, position_index, parent_position_id::text
            FROM org_positions
            WHERE company_id = :company_id
            ORDER BY 
                CASE level 
                    WHEN 'MANAGER' THEN 0 
                    WHEN 'N' THEN 1 
                    WHEN 'N-1' THEN 2 
                    WHEN 'N-2' THEN 3 
                END,
                position_index
        """),
        {"company_id": company_id}
    )
    positions = [
        PositionResponse(
            id=str(row["id"]),
            level=row["level"],
            position_index=row["position_index"],
            parent_position_id=row["parent_position_id"]
        )
        for row in positions_result.mappings().all()
    ]
    
    # Get all employees with their blueprint info
    employees_result = await db.execute(
        text("""
            SELECT 
                e.id, e.position_id::text, e.blueprint_id::text,
                e.first_name, e.last_name, e.bio, e.portrait_id::text,
                e.skills, e.email, e.phone, e.is_removable,
                b.role as blueprint_role, b.level::text as blueprint_level,
                p.uri as portrait_uri
            FROM company_employees e
            LEFT JOIN blueprints b ON b.id = e.blueprint_id
            LEFT JOIN portrait_library p ON p.id = e.portrait_id
            WHERE e.company_id = :company_id AND e.is_active = true
        """),
        {"company_id": company_id}
    )
    
    employees = {}
    for row in employees_result.mappings().all():
        employees[row["position_id"]] = EmployeeResponse(
            id=str(row["id"]),
            position_id=row["position_id"],
            blueprint_id=row["blueprint_id"],
            first_name=row["first_name"],
            last_name=row["last_name"],
            bio=normalize_localized_text(row["bio"]),
            portrait_id=row["portrait_id"],
            portrait_uri=row["portrait_uri"],
            skills=row["skills"] or [],
            email=row["email"],
            phone=row["phone"],
            is_removable=row["is_removable"],
            role=normalize_localized_text(row["blueprint_role"]) if row["blueprint_role"] else None,
            level=row["blueprint_level"],
        )
    
    return OrgChartResponse(
        company_id=company_id,
        positions=positions,
        employees=employees
    )


@router.get("/org-chart/available-blueprints", response_model=AvailableBlueprintsListResponse)
async def get_available_blueprints(
    company_id: str,
    position_id: str = Query(..., description="Position to fill"),
    search: str = Query(None, description="Search by role or code"),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Get blueprints available for recruitment at a specific position.
    Filters by:
    - Blueprint level matching position level
    - Blueprint parent constraints (N-2 must have allowed N-1 parent)
    """
    await require_company_access(user, company_id, db)
    
    # Get position info
    pos_result = await db.execute(
        text("""
            SELECT level::text, parent_position_id::text
            FROM org_positions
            WHERE id = :position_id AND company_id = :company_id
        """),
        {"position_id": position_id, "company_id": company_id}
    )
    position = pos_result.mappings().first()
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")
    
    pos_level = position["level"]
    parent_pos_id = position["parent_position_id"]
    
    # For MANAGER and N positions, no blueprints (special handling)
    if pos_level in ("MANAGER", "N"):
        # N (Co-President) needs a specific blueprint with level N
        level_filter = pos_level
    else:
        level_filter = pos_level
    
    # Build query
    params = {"company_id": company_id, "level": level_filter}
    
    # Base query: active blueprints of matching level
    query = """
        SELECT 
            b.id, b.code, b.role, b.level::text, 
            b.default_first_name, b.default_last_name, b.default_bio,
            b.default_portrait_id::text as portrait_id, b.skills,
            p.uri as portrait_uri,
            COALESCE(hired.cnt, 0) as already_hired_count
        FROM blueprints b
        LEFT JOIN portrait_library p ON p.id = b.default_portrait_id
        LEFT JOIN (
            SELECT blueprint_id, COUNT(*) as cnt
            FROM company_employees
            WHERE company_id = :company_id
            GROUP BY blueprint_id
        ) hired ON hired.blueprint_id = b.id
        WHERE b.is_active = true AND b.level = CAST(:level AS blueprint_level)
    """
    
    # For N-2 positions, filter by allowed parent N-1 blueprints
    if pos_level == "N-2" and parent_pos_id:
        # Get the N-1 employee at parent position to find which blueprints are allowed
        parent_emp_result = await db.execute(
            text("""
                SELECT blueprint_id::text
                FROM company_employees
                WHERE position_id = :parent_pos_id AND is_active = true
            """),
            {"parent_pos_id": parent_pos_id}
        )
        parent_emp = parent_emp_result.mappings().first()
        
        if parent_emp and parent_emp["blueprint_id"]:
            # Filter N-2 blueprints that can be children of this N-1 blueprint
            query += """
                AND b.id IN (
                    SELECT child_blueprint_id FROM blueprint_relations
                    WHERE parent_blueprint_id = :parent_blueprint_id
                )
            """
            params["parent_blueprint_id"] = parent_emp["blueprint_id"]
    
    # Add search filter
    if search:
        query += """
            AND (
                b.code ILIKE :search 
                OR b.role::text ILIKE :search
            )
        """
        params["search"] = f"%{search}%"
    
    query += " ORDER BY b.code"
    
    result = await db.execute(text(query), params)
    blueprints = result.mappings().all()
    
    items = [
        AvailableBlueprintResponse(
            id=str(row["id"]),
            code=row["code"],
            role=normalize_localized_text(row["role"]),
            level=row["level"],
            default_first_name=row["default_first_name"],
            default_last_name=row["default_last_name"],
            default_bio=normalize_localized_text(row["default_bio"]),
            portrait_id=row["portrait_id"],
            portrait_uri=row["portrait_uri"],
            skills=row["skills"] or [],
            already_hired_count=row["already_hired_count"]
        )
        for row in blueprints
    ]
    
    return AvailableBlueprintsListResponse(items=items, total=len(items))


@router.post("/org-chart/recruit", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def recruit_employee(
    company_id: str,
    data: RecruitRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Recruit a blueprint into a position, creating a new employee."""
    await require_company_access(user, company_id, db)
    
    # Verify position exists and is empty
    pos_result = await db.execute(
        text("""
            SELECT p.id, p.level::text
            FROM org_positions p
            LEFT JOIN company_employees e ON e.position_id = p.id AND e.is_active = true
            WHERE p.id = :position_id AND p.company_id = :company_id
        """),
        {"position_id": data.position_id, "company_id": company_id}
    )
    position = pos_result.mappings().first()
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")
    
    # Check if position is already filled
    existing = await db.execute(
        text("""
            SELECT id FROM company_employees
            WHERE position_id = :position_id AND is_active = true
        """),
        {"position_id": data.position_id}
    )
    if existing.first():
        raise HTTPException(status_code=400, detail="Position already filled")
    
    # Get blueprint info
    bp_result = await db.execute(
        text("""
            SELECT 
                b.id, b.level::text, b.role,
                b.default_first_name, b.default_last_name, b.default_bio,
                b.default_portrait_id, b.skills,
                p.uri as portrait_uri
            FROM blueprints b
            LEFT JOIN portrait_library p ON p.id = b.default_portrait_id
            WHERE b.id = :blueprint_id AND b.is_active = true
        """),
        {"blueprint_id": data.blueprint_id}
    )
    blueprint = bp_result.mappings().first()
    if not blueprint:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    
    # Verify level matches
    if blueprint["level"] != position["level"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Blueprint level ({blueprint['level']}) doesn't match position level ({position['level']})"
        )
    
    # Create employee
    first_name = data.first_name or blueprint["default_first_name"]
    last_name = data.last_name or blueprint["default_last_name"]
    bio = normalize_localized_text(blueprint["default_bio"])
    
    result = await db.execute(
        text("""
            INSERT INTO company_employees (
                company_id, blueprint_id, position_id,
                first_name, last_name, bio, portrait_id, skills
            ) VALUES (
                :company_id, :blueprint_id, :position_id,
                :first_name, :last_name, CAST(:bio AS jsonb), :portrait_id, :skills
            )
            RETURNING id
        """),
        {
            "company_id": company_id,
            "blueprint_id": data.blueprint_id,
            "position_id": data.position_id,
            "first_name": first_name,
            "last_name": last_name,
            "bio": json.dumps(bio),
            "portrait_id": blueprint["default_portrait_id"],
            "skills": blueprint["skills"] or [],
        }
    )
    employee_id = str(result.mappings().first()["id"])
    await db.commit()
    
    return EmployeeResponse(
        id=employee_id,
        position_id=data.position_id,
        blueprint_id=data.blueprint_id,
        first_name=first_name,
        last_name=last_name,
        bio=bio,
        portrait_id=str(blueprint["default_portrait_id"]) if blueprint["default_portrait_id"] else None,
        portrait_uri=blueprint["portrait_uri"],
        skills=blueprint["skills"] or [],
        email=None,
        phone=None,
        is_removable=True,
        role=normalize_localized_text(blueprint["role"]),
        level=blueprint["level"],
    )


@router.put("/employees/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    company_id: str,
    employee_id: str,
    data: EmployeeUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Update an employee's customizable fields."""
    await require_company_access(user, company_id, db)
    
    # Verify employee exists
    emp_result = await db.execute(
        text("""
            SELECT e.*, b.role as blueprint_role, b.level::text as blueprint_level,
                   p.uri as portrait_uri
            FROM company_employees e
            LEFT JOIN blueprints b ON b.id = e.blueprint_id
            LEFT JOIN portrait_library p ON p.id = e.portrait_id
            WHERE e.id = :employee_id AND e.company_id = :company_id
        """),
        {"employee_id": employee_id, "company_id": company_id}
    )
    employee = emp_result.mappings().first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Build update
    update_fields = []
    params = {"employee_id": employee_id}
    
    if data.first_name is not None:
        update_fields.append("first_name = :first_name")
        params["first_name"] = data.first_name
    if data.last_name is not None:
        update_fields.append("last_name = :last_name")
        params["last_name"] = data.last_name
    if data.bio is not None:
        update_fields.append("bio = CAST(:bio AS jsonb)")
        params["bio"] = json.dumps(data.bio)
    if data.portrait_id is not None:
        update_fields.append("portrait_id = :portrait_id")
        params["portrait_id"] = data.portrait_id if data.portrait_id else None
    if data.skills is not None:
        update_fields.append("skills = :skills")
        params["skills"] = data.skills
    if data.email is not None:
        update_fields.append("email = :email")
        params["email"] = data.email
    if data.phone is not None:
        update_fields.append("phone = :phone")
        params["phone"] = data.phone
    
    if update_fields:
        await db.execute(
            text(f"UPDATE company_employees SET {', '.join(update_fields)} WHERE id = :employee_id"),
            params
        )
        await db.commit()
    
    # Return updated employee
    result = await db.execute(
        text("""
            SELECT e.*, b.role as blueprint_role, b.level::text as blueprint_level,
                   p.uri as portrait_uri
            FROM company_employees e
            LEFT JOIN blueprints b ON b.id = e.blueprint_id
            LEFT JOIN portrait_library p ON p.id = e.portrait_id
            WHERE e.id = :employee_id
        """),
        {"employee_id": employee_id}
    )
    row = result.mappings().first()
    
    return EmployeeResponse(
        id=str(row["id"]),
        position_id=str(row["position_id"]),
        blueprint_id=str(row["blueprint_id"]) if row["blueprint_id"] else None,
        first_name=row["first_name"],
        last_name=row["last_name"],
        bio=normalize_localized_text(row["bio"]),
        portrait_id=str(row["portrait_id"]) if row["portrait_id"] else None,
        portrait_uri=row["portrait_uri"],
        skills=row["skills"] or [],
        email=row["email"],
        phone=row["phone"],
        is_removable=row["is_removable"],
        role=normalize_localized_text(row["blueprint_role"]) if row["blueprint_role"] else None,
        level=row["blueprint_level"],
    )


@router.delete("/employees/{employee_id}")
async def remove_employee(
    company_id: str,
    employee_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Remove an employee from the company (frees up the position)."""
    await require_company_access(user, company_id, db)
    
    # Verify employee exists and is removable
    emp_result = await db.execute(
        text("""
            SELECT id, is_removable
            FROM company_employees
            WHERE id = :employee_id AND company_id = :company_id
        """),
        {"employee_id": employee_id, "company_id": company_id}
    )
    employee = emp_result.mappings().first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    if not employee["is_removable"]:
        raise HTTPException(status_code=400, detail="This employee cannot be removed")
    
    # Delete employee (position becomes available again)
    await db.execute(
        text("DELETE FROM company_employees WHERE id = :employee_id"),
        {"employee_id": employee_id}
    )
    await db.commit()
    
    return {"message": "Employee removed successfully"}


@router.post("/org-chart/reset", status_code=status.HTTP_200_OK)
async def reset_org_chart(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Reset the organization chart to its default structure.
    Preserves the Manager (company owner) information but removes all other employees.
    """
    await require_company_access(user, company_id, db)
    
    # 1. Backup Manager info
    manager_query = text("""
        SELECT e.first_name, e.last_name, e.email
        FROM org_positions p
        JOIN company_employees e ON e.position_id = p.id
        WHERE p.company_id = :company_id AND p.level = 'MANAGER'
    """)
    result = await db.execute(manager_query, {"company_id": company_id})
    manager = result.mappings().first()
    
    # Defaults if manager not found (should not happen for valid company, but fallback just in case)
    manager_info = {
        "first_name": manager["first_name"] if manager else "Manager",
        "last_name": manager["last_name"] if manager else "Unknown",
        "email": manager["email"] if manager else None,
    }
    
    # 2. Delete all positions (cascades to employees)
    await db.execute(
        text("DELETE FROM org_positions WHERE company_id = :company_id"),
        {"company_id": company_id}
    )
    
    # 3. Initialize default structure
    await db.execute(
        text("SELECT init_company_org_chart(:company_id)"),
        {"company_id": company_id}
    )
    
    # 4. Restore Manager employee
    await db.execute(
        text("SELECT create_company_manager(:company_id, :first_name, :last_name, :email)"),
        {
            "company_id": company_id,
            "first_name": manager_info["first_name"],
            "last_name": manager_info["last_name"],
            "email": manager_info["email"],
        }
    )
    
    await db.commit()
    
    # Return updated org chart
    return await get_org_chart(company_id, db, user)
