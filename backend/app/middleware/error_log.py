import json
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.db.session import AsyncSessionLocal
from app.models.api_error_log import ApiErrorLog

_SCRUB_KEYS: frozenset[str] = frozenset({
    "description", "controls", "mitigation_plan", "comments",
    "ai_insight", "root_cause", "title", "password", "pin",
    "password_hash", "token",
})

_BODY_METHODS: frozenset[str] = frozenset({"POST", "PUT", "PATCH"})


def _scrub(body: dict) -> dict:
    return {
        k: "[redacted]" if k in _SCRUB_KEYS else v
        for k, v in body.items()
    }


async def _parse_body(request: Request) -> dict | None:
    if request.method not in _BODY_METHODS:
        return None
    try:
        raw = await request.body()
        if not raw:
            return None
        return _scrub(json.loads(raw))
    except Exception:
        return None


class ErrorLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = int((time.monotonic() - start) * 1000)

        if response.status_code < 400:
            return response

        tenant_id: str | None = getattr(request.state, "tenant_id", None)
        body = await _parse_body(request)

        import asyncio

        async def _persist() -> None:
            try:
                async with AsyncSessionLocal() as db:
                    db.add(ApiErrorLog(
                        tenant_id=tenant_id,
                        method=request.method,
                        path=request.url.path,
                        status_code=response.status_code,
                        error_detail=None,
                        request_body=body,
                        duration_ms=duration_ms,
                    ))
                    await db.commit()
            except Exception:
                pass

        asyncio.create_task(_persist())

        return response