"""
Security middleware for FluidManager API.
Handles JWT authentication for all protected endpoints.
"""

from __future__ import annotations
from datetime import datetime, timezone

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send
from jose import jwt, JWTError

from .settings import settings


class JWTAuthMiddleware:
    """
    ASGI Middleware for JWT authentication.
    
    Public paths (no auth required):
    - /health
    - /auth/* (login, forgot-password, reset-password)
    - /docs, /openapi.json (Swagger UI)
    
    All other paths require a valid JWT Bearer token.
    """
    
    def __init__(self, app: ASGIApp, public_prefixes: set[str] | None = None):
        self.app = app
        self.public_prefixes = public_prefixes or {
            "/health",
            "/auth/",
            "/docs",
            "/openapi.json",
            "/redoc",
        }

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # 1. Only handle HTTP requests
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # 2. Let CORS preflight pass through
        if scope.get("method") == "OPTIONS":
            await self.app(scope, receive, send)
            return

        # 3. Check if path is public
        path = scope.get("path", "")
        
        # Exact match for certain paths
        if path in {"/health", "/docs", "/openapi.json", "/redoc"}:
            await self.app(scope, receive, send)
            return
        
        # Prefix match for auth endpoints
        if path.startswith("/auth/") or path == "/auth":
            await self.app(scope, receive, send)
            return

        # Static files (portraits, etc.) - no auth required
        if path.startswith("/static/"):
            await self.app(scope, receive, send)
            return

        # 4. Validate JWT Bearer token
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        auth_header = headers.get("authorization", "")
        
        if not auth_header.startswith("Bearer "):
            res = JSONResponse(
                {"detail": "Not authenticated"},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"}
            )
            await res(scope, receive, send)
            return
        
        token = auth_header[7:]  # Remove "Bearer " prefix
        
        try:
            payload = jwt.decode(
                token,
                settings.JWT_SECRET,
                algorithms=[settings.JWT_ALGORITHM]
            )
            
            # Check expiration
            exp = payload.get("exp")
            if exp and datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(timezone.utc):
                res = JSONResponse(
                    {"detail": "Token expired"},
                    status_code=401,
                    headers={"WWW-Authenticate": "Bearer"}
                )
                await res(scope, receive, send)
                return
            
            # Add user info to scope for use in endpoints
            scope["user"] = payload
            
        except JWTError as e:
            res = JSONResponse(
                {"detail": f"Invalid token: {str(e)}"},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"}
            )
            await res(scope, receive, send)
            return

        # 5. All good, continue
        await self.app(scope, receive, send)


# Deprecated: Keep for backward compatibility during migration
class ApiKeyASGIMiddleware:
    """
    DEPRECATED: This middleware is being replaced by JWTAuthMiddleware.
    Kept temporarily for backward compatibility.
    """
    
    def __init__(self, app: ASGIApp, api_key: str | None, public_paths: set[str] | None = None):
        self.app = app
        self.api_key = api_key
        self.public_paths = public_paths or {"/health"}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Just pass through - we're using JWT now
        await self.app(scope, receive, send)