from __future__ import annotations

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

class ApiKeyASGIMiddleware:
    def __init__(self, app: ASGIApp, api_key: str | None, public_paths: set[str] | None = None):
        self.app = app
        self.api_key = api_key
        self.public_paths = public_paths or {"/health"}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path in self.public_paths:
            await self.app(scope, receive, send)
            return

        if not self.api_key:
            res = JSONResponse({"detail": "API_ADMIN_KEY not configured"}, status_code=500)
            await res(scope, receive, send)
            return

        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        key = headers.get("x-api-key")

        if not key or key != self.api_key:
            res = JSONResponse({"detail": "Unauthorized"}, status_code=401)
            await res(scope, receive, send)
            return

        await self.app(scope, receive, send)
