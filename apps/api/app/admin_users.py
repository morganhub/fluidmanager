"""
Admin Users CRUD endpoints for FluidManager
Requires superadmin role for all operations.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .auth import require_superadmin, hash_password

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


# =============================================================================
# Pydantic Models
# =============================================================================

class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    role: str = "manager"  # "superadmin" or "manager"
    organization: str | None = None
    valid_until: datetime | None = None


class AdminUserUpdate(BaseModel):
    email: EmailStr | None = None
    first_name: str | None = None
    last_name: str | None = None
    role: str | None = None
    organization: str | None = None
    valid_until: datetime | None = None
    is_active: bool | None = None


class AdminUserResponse(BaseModel):
    id: str
    email: str
    first_name: str
    last_name: str
    role: str
    organization: str | None
    valid_until: datetime | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    companies: list[dict] = []


class AdminUserListResponse(BaseModel):
    items: list[AdminUserResponse]
    total: int
    page: int
    page_size: int


class CompanyAssignment(BaseModel):
    company_ids: list[str]


class MessageResponse(BaseModel):
    message: str


# =============================================================================
# Endpoints
# =============================================================================

@router.get("", response_model=AdminUserListResponse)
async def list_admin_users(
    search: str | None = Query(None, description="Search by email, first_name, last_name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_superadmin)
):
    """List all admin users with pagination and search."""
    offset = (page - 1) * page_size
    
    # Build search condition
    search_condition = ""
    params = {"limit": page_size, "offset": offset}
    
    if search:
        search_condition = """
            AND (
                email ILIKE :search 
                OR first_name ILIKE :search 
                OR last_name ILIKE :search
                OR organization ILIKE :search
            )
        """
        params["search"] = f"%{search}%"
    
    # Get total count
    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM admin_users WHERE 1=1 {search_condition}"),
        params
    )
    total = count_result.scalar()
    
    # Get users
    result = await db.execute(
        text(f"""
            SELECT id, email, first_name, last_name, role, organization, 
                   valid_until, is_active, created_at, updated_at
            FROM admin_users
            WHERE 1=1 {search_condition}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params
    )
    users = result.mappings().all()
    
    # Fetch companies for each user
    items = []
    for user in users:
        companies_result = await db.execute(
            text("""
                SELECT c.id::text, c.code, c.name
                FROM companies c
                JOIN admin_user_companies auc ON c.id = auc.company_id
                WHERE auc.admin_user_id = :user_id
            """),
            {"user_id": user["id"]}
        )
        companies = [dict(row) for row in companies_result.mappings().all()]
        
        items.append(AdminUserResponse(
            id=str(user["id"]),
            email=user["email"],
            first_name=user["first_name"],
            last_name=user["last_name"],
            role=user["role"],
            organization=user["organization"],
            valid_until=user["valid_until"],
            is_active=user["is_active"],
            created_at=user["created_at"],
            updated_at=user["updated_at"],
            companies=companies,
        ))
    
    return AdminUserListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def create_admin_user(
    data: AdminUserCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_superadmin)
):
    """Create a new admin user."""
    # Validate role
    if data.role not in ("superadmin", "manager"):
        raise HTTPException(status_code=400, detail="Role must be 'superadmin' or 'manager'")
    
    # Validate password
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Check if email already exists
    existing = await db.execute(
        text("SELECT id FROM admin_users WHERE email = :email"),
        {"email": data.email}
    )
    if existing.first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Hash password
    password_hash = hash_password(data.password)
    
    # Insert user
    result = await db.execute(
        text("""
            INSERT INTO admin_users (email, password_hash, first_name, last_name, role, organization, valid_until)
            VALUES (:email, :password_hash, :first_name, :last_name, :role, :organization, :valid_until)
            RETURNING id, email, first_name, last_name, role, organization, valid_until, is_active, created_at, updated_at
        """),
        {
            "email": data.email,
            "password_hash": password_hash,
            "first_name": data.first_name,
            "last_name": data.last_name,
            "role": data.role,
            "organization": data.organization,
            "valid_until": data.valid_until,
        }
    )
    user = result.mappings().first()
    await db.commit()
    
    return AdminUserResponse(
        id=str(user["id"]),
        email=user["email"],
        first_name=user["first_name"],
        last_name=user["last_name"],
        role=user["role"],
        organization=user["organization"],
        valid_until=user["valid_until"],
        is_active=user["is_active"],
        created_at=user["created_at"],
        updated_at=user["updated_at"],
        companies=[],
    )


@router.get("/{user_id}", response_model=AdminUserResponse)
async def get_admin_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_superadmin)
):
    """Get a single admin user by ID."""
    result = await db.execute(
        text("""
            SELECT id, email, first_name, last_name, role, organization,
                   valid_until, is_active, created_at, updated_at
            FROM admin_users WHERE id = :user_id
        """),
        {"user_id": user_id}
    )
    user = result.mappings().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get companies
    companies_result = await db.execute(
        text("""
            SELECT c.id::text, c.code, c.name
            FROM companies c
            JOIN admin_user_companies auc ON c.id = auc.company_id
            WHERE auc.admin_user_id = :user_id
        """),
        {"user_id": user_id}
    )
    companies = [dict(row) for row in companies_result.mappings().all()]
    
    return AdminUserResponse(
        id=str(user["id"]),
        email=user["email"],
        first_name=user["first_name"],
        last_name=user["last_name"],
        role=user["role"],
        organization=user["organization"],
        valid_until=user["valid_until"],
        is_active=user["is_active"],
        created_at=user["created_at"],
        updated_at=user["updated_at"],
        companies=companies,
    )


@router.put("/{user_id}", response_model=AdminUserResponse)
async def update_admin_user(
    user_id: str,
    data: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_superadmin)
):
    """Update an admin user."""
    # Check user exists
    existing = await db.execute(
        text("SELECT id FROM admin_users WHERE id = :user_id"),
        {"user_id": user_id}
    )
    if not existing.first():
        raise HTTPException(status_code=404, detail="User not found")
    
    # Build update query dynamically
    updates = []
    params = {"user_id": user_id}
    
    if data.email is not None:
        # Check email uniqueness
        dup = await db.execute(
            text("SELECT id FROM admin_users WHERE email = :email AND id != :user_id"),
            {"email": data.email, "user_id": user_id}
        )
        if dup.first():
            raise HTTPException(status_code=400, detail="Email already registered")
        updates.append("email = :email")
        params["email"] = data.email
    
    if data.first_name is not None:
        updates.append("first_name = :first_name")
        params["first_name"] = data.first_name
    
    if data.last_name is not None:
        updates.append("last_name = :last_name")
        params["last_name"] = data.last_name
    
    if data.role is not None:
        if data.role not in ("superadmin", "manager"):
            raise HTTPException(status_code=400, detail="Role must be 'superadmin' or 'manager'")
        updates.append("role = :role")
        params["role"] = data.role
    
    if data.organization is not None:
        updates.append("organization = :organization")
        params["organization"] = data.organization
    
    if data.valid_until is not None:
        updates.append("valid_until = :valid_until")
        params["valid_until"] = data.valid_until
    
    if data.is_active is not None:
        updates.append("is_active = :is_active")
        params["is_active"] = data.is_active
    
    if updates:
        updates.append("updated_at = now()")
        update_clause = ", ".join(updates)
        await db.execute(
            text(f"UPDATE admin_users SET {update_clause} WHERE id = :user_id"),
            params
        )
        await db.commit()
    
    # Return updated user
    return await get_admin_user(user_id, db, _)


@router.delete("/{user_id}", response_model=MessageResponse)
async def delete_admin_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_superadmin)
):
    """Delete an admin user."""
    # Prevent self-deletion
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    result = await db.execute(
        text("DELETE FROM admin_users WHERE id = :user_id RETURNING id"),
        {"user_id": user_id}
    )
    deleted = result.first()
    
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db.commit()
    return MessageResponse(message="User deleted successfully")


@router.put("/{user_id}/companies", response_model=AdminUserResponse)
async def assign_companies(
    user_id: str,
    data: CompanyAssignment,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_superadmin)
):
    """Assign companies to an admin user. Replaces existing assignments."""
    # Check user exists
    existing = await db.execute(
        text("SELECT id FROM admin_users WHERE id = :user_id"),
        {"user_id": user_id}
    )
    if not existing.first():
        raise HTTPException(status_code=404, detail="User not found")
    
    # Validate all company IDs exist
    if data.company_ids:
        placeholders = ", ".join([f":c{i}" for i in range(len(data.company_ids))])
        params = {f"c{i}": cid for i, cid in enumerate(data.company_ids)}
        result = await db.execute(
            text(f"SELECT id FROM companies WHERE id IN ({placeholders})"),
            params
        )
        found_ids = [str(row[0]) for row in result.fetchall()]
        missing = set(data.company_ids) - set(found_ids)
        if missing:
            raise HTTPException(status_code=400, detail=f"Companies not found: {', '.join(missing)}")
    
    # Delete existing assignments
    await db.execute(
        text("DELETE FROM admin_user_companies WHERE admin_user_id = :user_id"),
        {"user_id": user_id}
    )
    
    # Insert new assignments
    for company_id in data.company_ids:
        await db.execute(
            text("""
                INSERT INTO admin_user_companies (admin_user_id, company_id)
                VALUES (:user_id, :company_id)
            """),
            {"user_id": user_id, "company_id": company_id}
        )
    
    await db.commit()
    
    # Return updated user
    return await get_admin_user(user_id, db, _)


@router.put("/{user_id}/password", response_model=MessageResponse)
async def reset_user_password(
    user_id: str,
    new_password: str = Query(..., min_length=6),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_superadmin)
):
    """Reset a user's password (superadmin only)."""
    # Check user exists
    existing = await db.execute(
        text("SELECT id FROM admin_users WHERE id = :user_id"),
        {"user_id": user_id}
    )
    if not existing.first():
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update password
    password_hash = hash_password(new_password)
    await db.execute(
        text("UPDATE admin_users SET password_hash = :hash, updated_at = now() WHERE id = :user_id"),
        {"hash": password_hash, "user_id": user_id}
    )
    await db.commit()
    
    return MessageResponse(message="Password updated successfully")
