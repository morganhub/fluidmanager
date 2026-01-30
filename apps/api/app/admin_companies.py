"""
Admin Companies CRUD endpoints for FluidManager
Requires superadmin role for all operations.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .auth import require_superadmin

router = APIRouter(prefix="/admin/companies", tags=["admin-companies"])


# =============================================================================
# Pydantic Models
# =============================================================================

class CompanyCreate(BaseModel):
    code: str
    name: str
    legal_name: str | None = None
    tagline: str | None = None
    description_short: str | None = None
    website_url: str | None = None
    country_code: str = "FR"
    siret: str | None = None
    locale: str = "fr-FR"
    timezone: str = "Europe/Paris"
    currency: str = "EUR"
    # Manager info (optional - for auto-creating manager profile)
    manager_first_name: str | None = None
    manager_last_name: str | None = None
    manager_email: str | None = None



class CompanyUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    legal_name: str | None = None
    tagline: str | None = None
    description_short: str | None = None
    website_url: str | None = None
    country_code: str | None = None
    siret: str | None = None
    locale: str | None = None
    timezone: str | None = None
    currency: str | None = None
    is_active: bool | None = None


class CompanyResponse(BaseModel):
    id: str
    code: str
    name: str
    legal_name: str | None
    tagline: str | None
    description_short: str | None
    website_url: str | None
    country_code: str
    siret: str | None
    locale: str
    timezone: str
    currency: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    assigned_users: list[dict] = []


class CompanyListResponse(BaseModel):
    items: list[CompanyResponse]
    total: int
    page: int
    page_size: int


class UserAssignment(BaseModel):
    user_ids: list[str]


class MessageResponse(BaseModel):
    message: str


# =============================================================================
# Endpoints
# =============================================================================

@router.get("", response_model=CompanyListResponse)
async def list_companies(
    search: str | None = Query(None, description="Search by code, name, legal_name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_superadmin)
):
    """List all companies with pagination and search."""
    offset = (page - 1) * page_size
    
    # Build search condition
    search_condition = ""
    params = {"limit": page_size, "offset": offset}
    
    if search:
        search_condition = """
            AND (
                code ILIKE :search 
                OR name ILIKE :search 
                OR legal_name ILIKE :search
            )
        """
        params["search"] = f"%{search}%"
    
    # Get total count
    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM companies WHERE 1=1 {search_condition}"),
        params
    )
    total = count_result.scalar()
    
    # Get companies
    result = await db.execute(
        text(f"""
            SELECT id, code, name, legal_name, tagline, description_short, website_url,
                   country_code, siret, locale, timezone, currency, is_active, created_at, updated_at
            FROM companies
            WHERE 1=1 {search_condition}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params
    )
    companies = result.mappings().all()
    
    # Fetch assigned users for each company
    items = []
    for company in companies:
        users_result = await db.execute(
            text("""
                SELECT u.id::text, u.email, u.first_name, u.last_name, u.role
                FROM admin_users u
                JOIN admin_user_companies auc ON u.id = auc.admin_user_id
                WHERE auc.company_id = :company_id
            """),
            {"company_id": company["id"]}
        )
        users = [dict(row) for row in users_result.mappings().all()]
        
        items.append(CompanyResponse(
            id=str(company["id"]),
            code=company["code"],
            name=company["name"],
            legal_name=company["legal_name"],
            tagline=company["tagline"],
            description_short=company["description_short"],
            website_url=company["website_url"],
            country_code=company["country_code"],
            siret=company["siret"],
            locale=company["locale"],
            timezone=company["timezone"],
            currency=company["currency"],
            is_active=company["is_active"],
            created_at=company["created_at"],
            updated_at=company["updated_at"],
            assigned_users=users,
        ))
    
    return CompanyListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    data: CompanyCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_superadmin)
):
    """Create a new company."""
    # Check if code already exists
    existing = await db.execute(
        text("SELECT id FROM companies WHERE code = :code"),
        {"code": data.code}
    )
    if existing.first():
        raise HTTPException(status_code=400, detail="Company code already exists")
    
    # Insert company
    result = await db.execute(
        text("""
            INSERT INTO companies (code, name, legal_name, tagline, description_short, website_url,
                                   country_code, siret, locale, timezone, currency)
            VALUES (:code, :name, :legal_name, :tagline, :description_short, :website_url,
                    :country_code, :siret, :locale, :timezone, :currency)
            RETURNING id, code, name, legal_name, tagline, description_short, website_url,
                      country_code, siret, locale, timezone, currency, is_active, created_at, updated_at
        """),
        {
            "code": data.code,
            "name": data.name,
            "legal_name": data.legal_name,
            "tagline": data.tagline,
            "description_short": data.description_short,
            "website_url": data.website_url,
            "country_code": data.country_code,
            "siret": data.siret,
            "locale": data.locale,
            "timezone": data.timezone,
            "currency": data.currency,
        }
    )
    company = result.mappings().first()
    company_id = str(company["id"])
    
    # Initialize org chart structure (Manager, N, 3 N-1, 9 N-2 positions)
    await db.execute(
        text("SELECT init_company_org_chart(:company_id)"),
        {"company_id": company_id}
    )
    
    # Create manager profile if info provided
    if data.manager_first_name and data.manager_last_name:
        await db.execute(
            text("SELECT create_company_manager(:company_id, :first_name, :last_name, :email)"),
            {
                "company_id": company_id,
                "first_name": data.manager_first_name,
                "last_name": data.manager_last_name,
                "email": data.manager_email,
            }
        )
    
    await db.commit()
    
    return CompanyResponse(
        id=company_id,
        code=company["code"],
        name=company["name"],
        legal_name=company["legal_name"],
        tagline=company["tagline"],
        description_short=company["description_short"],
        website_url=company["website_url"],
        country_code=company["country_code"],
        siret=company["siret"],
        locale=company["locale"],
        timezone=company["timezone"],
        currency=company["currency"],
        is_active=company["is_active"],
        created_at=company["created_at"],
        updated_at=company["updated_at"],
        assigned_users=[],
    )



@router.get("/{company_id}", response_model=CompanyResponse)
async def get_company(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_superadmin)
):
    """Get a single company by ID."""
    result = await db.execute(
        text("""
            SELECT id, code, name, legal_name, tagline, description_short, website_url,
                   country_code, siret, locale, timezone, currency, is_active, created_at, updated_at
            FROM companies WHERE id = :company_id
        """),
        {"company_id": company_id}
    )
    company = result.mappings().first()
    
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Get assigned users
    users_result = await db.execute(
        text("""
            SELECT u.id::text, u.email, u.first_name, u.last_name, u.role
            FROM admin_users u
            JOIN admin_user_companies auc ON u.id = auc.admin_user_id
            WHERE auc.company_id = :company_id
        """),
        {"company_id": company_id}
    )
    users = [dict(row) for row in users_result.mappings().all()]
    
    return CompanyResponse(
        id=str(company["id"]),
        code=company["code"],
        name=company["name"],
        legal_name=company["legal_name"],
        tagline=company["tagline"],
        description_short=company["description_short"],
        website_url=company["website_url"],
        country_code=company["country_code"],
        siret=company["siret"],
        locale=company["locale"],
        timezone=company["timezone"],
        currency=company["currency"],
        is_active=company["is_active"],
        created_at=company["created_at"],
        updated_at=company["updated_at"],
        assigned_users=users,
    )


@router.put("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: str,
    data: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_superadmin)
):
    """Update a company."""
    # Check company exists
    existing = await db.execute(
        text("SELECT id FROM companies WHERE id = :company_id"),
        {"company_id": company_id}
    )
    if not existing.first():
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Build update query dynamically
    updates = []
    params = {"company_id": company_id}
    
    if data.code is not None:
        # Check code uniqueness
        dup = await db.execute(
            text("SELECT id FROM companies WHERE code = :code AND id != :company_id"),
            {"code": data.code, "company_id": company_id}
        )
        if dup.first():
            raise HTTPException(status_code=400, detail="Company code already exists")
        updates.append("code = :code")
        params["code"] = data.code
    
    if data.name is not None:
        updates.append("name = :name")
        params["name"] = data.name
    
    if data.legal_name is not None:
        updates.append("legal_name = :legal_name")
        params["legal_name"] = data.legal_name
    
    if data.tagline is not None:
        updates.append("tagline = :tagline")
        params["tagline"] = data.tagline
    
    if data.description_short is not None:
        updates.append("description_short = :description_short")
        params["description_short"] = data.description_short
    
    if data.website_url is not None:
        updates.append("website_url = :website_url")
        params["website_url"] = data.website_url
    
    if data.country_code is not None:
        updates.append("country_code = :country_code")
        params["country_code"] = data.country_code
    
    if data.siret is not None:
        updates.append("siret = :siret")
        params["siret"] = data.siret
    
    if data.locale is not None:
        updates.append("locale = :locale")
        params["locale"] = data.locale
    
    if data.timezone is not None:
        updates.append("timezone = :timezone")
        params["timezone"] = data.timezone
    
    if data.currency is not None:
        updates.append("currency = :currency")
        params["currency"] = data.currency
    
    if data.is_active is not None:
        updates.append("is_active = :is_active")
        params["is_active"] = data.is_active
    
    if updates:
        updates.append("updated_at = now()")
        update_clause = ", ".join(updates)
        await db.execute(
            text(f"UPDATE companies SET {update_clause} WHERE id = :company_id"),
            params
        )
        await db.commit()
    
    # Return updated company
    return await get_company(company_id, db, _)


@router.delete("/{company_id}", response_model=MessageResponse)
async def delete_company(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_superadmin)
):
    """Delete a company."""
    result = await db.execute(
        text("DELETE FROM companies WHERE id = :company_id RETURNING id"),
        {"company_id": company_id}
    )
    deleted = result.first()
    
    if not deleted:
        raise HTTPException(status_code=404, detail="Company not found")
    
    await db.commit()
    return MessageResponse(message="Company deleted successfully")


@router.put("/{company_id}/users", response_model=CompanyResponse)
async def assign_users_to_company(
    company_id: str,
    data: UserAssignment,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_superadmin)
):
    """Assign users to a company. Replaces existing assignments for this company."""
    # Check company exists
    existing = await db.execute(
        text("SELECT id FROM companies WHERE id = :company_id"),
        {"company_id": company_id}
    )
    if not existing.first():
        raise HTTPException(status_code=404, detail="Company not found")
    
    # Validate all user IDs exist
    if data.user_ids:
        placeholders = ", ".join([f":u{i}" for i in range(len(data.user_ids))])
        params = {f"u{i}": uid for i, uid in enumerate(data.user_ids)}
        result = await db.execute(
            text(f"SELECT id FROM admin_users WHERE id IN ({placeholders})"),
            params
        )
        found_ids = [str(row[0]) for row in result.fetchall()]
        missing = set(data.user_ids) - set(found_ids)
        if missing:
            raise HTTPException(status_code=400, detail=f"Users not found: {', '.join(missing)}")
    
    # Delete existing assignments for this company
    await db.execute(
        text("DELETE FROM admin_user_companies WHERE company_id = :company_id"),
        {"company_id": company_id}
    )
    
    # Insert new assignments
    for user_id in data.user_ids:
        await db.execute(
            text("""
                INSERT INTO admin_user_companies (admin_user_id, company_id)
                VALUES (:user_id, :company_id)
                ON CONFLICT DO NOTHING
            """),
            {"user_id": user_id, "company_id": company_id}
        )
    
    await db.commit()
    
    # Return updated company
    return await get_company(company_id, db, _)
