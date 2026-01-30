"""
Authentication endpoints for FluidManager Admin Users
- POST /auth/login - Login with email/password, returns JWT
- GET /auth/me - Get current user info from JWT
- POST /auth/refresh - Refresh JWT token
- POST /auth/forgot-password - Request password reset email
- POST /auth/reset-password - Reset password with token
"""

from datetime import datetime, timedelta, timezone
from typing import Annotated
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt, JWTError
from passlib.context import CryptContext

from .db import get_db
from .settings import settings

router = APIRouter(prefix="/auth", tags=["auth"])

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Bearer scheme
bearer_scheme = HTTPBearer(auto_error=False)


# =============================================================================
# Pydantic Models
# =============================================================================

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "UserInfo"


class UserInfo(BaseModel):
    id: str
    email: str
    first_name: str
    last_name: str
    role: str
    organization: str | None
    companies: list[str]  # List of company IDs


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class MessageResponse(BaseModel):
    message: str


# =============================================================================
# Helper Functions
# =============================================================================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.JWT_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_user_companies(user_id: str, db: AsyncSession) -> list[str]:
    """Get list of company IDs assigned to a user."""
    result = await db.execute(
        text("SELECT company_id::text FROM admin_user_companies WHERE admin_user_id = :user_id"),
        {"user_id": user_id}
    )
    return [row[0] for row in result.fetchall()]


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Dependency to get the current authenticated user from JWT."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    payload = decode_access_token(token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify user still exists and is active
    result = await db.execute(
        text("""
            SELECT id, email, first_name, last_name, role, organization, is_active, valid_until
            FROM admin_users WHERE id = :user_id
        """),
        {"user_id": user_id}
    )
    user = result.mappings().first()
    
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    
    if not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account deactivated")
    
    if user["valid_until"] and user["valid_until"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account expired")
    
    # Get companies
    companies = await get_user_companies(str(user["id"]), db)
    
    return {
        "id": str(user["id"]),
        "email": user["email"],
        "first_name": user["first_name"],
        "last_name": user["last_name"],
        "role": user["role"],
        "organization": user["organization"],
        "companies": companies,
    }


def require_superadmin(user: dict = Depends(get_current_user)) -> dict:
    """Dependency that requires the user to be a superadmin."""
    if user["role"] != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin access required"
        )
    return user


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate with email/password and receive a JWT token."""
    # Find user by email
    result = await db.execute(
        text("""
            SELECT id, email, password_hash, first_name, last_name, role, organization, is_active, valid_until
            FROM admin_users WHERE email = :email
        """),
        {"email": request.email}
    )
    user = result.mappings().first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Verify password
    if not verify_password(request.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Check if account is active
    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account deactivated"
        )
    
    # Check validity date
    if user["valid_until"] and user["valid_until"] < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account expired"
        )
    
    # Get assigned companies
    companies = await get_user_companies(str(user["id"]), db)
    
    # Create JWT token
    token_data = {
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "companies": companies,
    }
    expires_delta = timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    access_token = create_access_token(token_data, expires_delta)
    
    return LoginResponse(
        access_token=access_token,
        expires_in=settings.JWT_EXPIRE_MINUTES * 60,
        user=UserInfo(
            id=str(user["id"]),
            email=user["email"],
            first_name=user["first_name"],
            last_name=user["last_name"],
            role=user["role"],
            organization=user["organization"],
            companies=companies,
        )
    )


@router.get("/me", response_model=UserInfo)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get the current authenticated user's information."""
    return UserInfo(**current_user)


@router.post("/refresh", response_model=LoginResponse)
async def refresh_token(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Refresh the JWT token."""
    # Get fresh companies list
    companies = await get_user_companies(current_user["id"], db)
    
    token_data = {
        "sub": current_user["id"],
        "email": current_user["email"],
        "role": current_user["role"],
        "companies": companies,
    }
    expires_delta = timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    access_token = create_access_token(token_data, expires_delta)
    
    return LoginResponse(
        access_token=access_token,
        expires_in=settings.JWT_EXPIRE_MINUTES * 60,
        user=UserInfo(
            id=current_user["id"],
            email=current_user["email"],
            first_name=current_user["first_name"],
            last_name=current_user["last_name"],
            role=current_user["role"],
            organization=current_user["organization"],
            companies=companies,
        )
    )


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(request: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """
    Request a password reset email.
    Always returns success message for security (don't reveal if email exists).
    """
    # Find user by email
    result = await db.execute(
        text("SELECT id, email, first_name FROM admin_users WHERE email = :email AND is_active = true"),
        {"email": request.email}
    )
    user = result.mappings().first()
    
    if user:
        # Generate reset token
        reset_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        
        # Store token in database
        await db.execute(
            text("""
                INSERT INTO password_reset_tokens (admin_user_id, token, expires_at)
                VALUES (:user_id, :token, :expires_at)
            """),
            {"user_id": user["id"], "token": reset_token, "expires_at": expires_at}
        )
        await db.commit()
        
        # Send email (async, non-blocking)
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
        await send_password_reset_email(user["email"], user["first_name"], reset_url)
    
    # Always return same message for security
    return MessageResponse(message="If this email exists, a password reset link has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(request: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Reset password using a valid reset token."""
    # Find valid token
    result = await db.execute(
        text("""
            SELECT t.id, t.admin_user_id, t.expires_at, t.used_at
            FROM password_reset_tokens t
            WHERE t.token = :token
        """),
        {"token": request.token}
    )
    token_row = result.mappings().first()
    
    if not token_row:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset token")
    
    if token_row["used_at"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token already used")
    
    if token_row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token expired")
    
    # Validate password (minimum 6 characters)
    if len(request.new_password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 6 characters")
    
    # Update password
    new_hash = hash_password(request.new_password)
    await db.execute(
        text("UPDATE admin_users SET password_hash = :hash, updated_at = now() WHERE id = :user_id"),
        {"hash": new_hash, "user_id": token_row["admin_user_id"]}
    )
    
    # Mark token as used
    await db.execute(
        text("UPDATE password_reset_tokens SET used_at = now() WHERE id = :token_id"),
        {"token_id": token_row["id"]}
    )
    
    await db.commit()
    
    return MessageResponse(message="Password successfully reset. You can now log in.")


# =============================================================================
# Email Helper
# =============================================================================

async def send_password_reset_email(to_email: str, first_name: str, reset_url: str):
    """Send password reset email asynchronously."""
    if not settings.SMTP_HOST:
        print(f"[EMAIL] SMTP not configured. Reset URL for {to_email}: {reset_url}")
        return
    
    try:
        import aiosmtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Réinitialisation de votre mot de passe FluidManager"
        msg["From"] = settings.SMTP_FROM
        msg["To"] = to_email
        
        text_content = f"""
Bonjour {first_name},

Vous avez demandé la réinitialisation de votre mot de passe FluidManager.

Cliquez sur le lien suivant pour définir un nouveau mot de passe :
{reset_url}

Ce lien est valable pendant 1 heure.

Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.

Cordialement,
L'équipe FluidManager
        """
        
        html_content = f"""
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Réinitialisation de mot de passe</h2>
        <p>Bonjour {first_name},</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe FluidManager.</p>
        <p>
            <a href="{reset_url}" 
               style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #2563eb, #7c3aed); color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                Réinitialiser mon mot de passe
            </a>
        </p>
        <p style="color: #666; font-size: 14px;">Ce lien est valable pendant 1 heure.</p>
        <p style="color: #666; font-size: 14px;">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">L'équipe FluidManager</p>
    </div>
</body>
</html>
        """
        
        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))
        
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            use_tls=settings.SMTP_USE_TLS,
        )
        print(f"[EMAIL] Password reset email sent to {to_email}")
        
    except Exception as e:
        print(f"[EMAIL] Failed to send password reset email to {to_email}: {e}")
