import asyncio
import json
import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.db.session import AsyncSessionLocal
from app.models.api_error_log import ApiErrorLog

logger = logging.getLogger(__name__)

# Routes where certain status codes are expected and not worth logging.
# Format: (path_prefix, status_code) — any path starting with the prefix
# that returns that exact status code is silently skipped.
_SKIP: tuple[tuple[str, int], ...] = (
    ("/api/v1/presence/", 401),
    ("/api/v1/presence/", 403),
    ("/api/v1/submissions/triage/count",    401),
    ("/api/v1/submissions/triage/count",    403),
    ("/api/v1/incident-severity/preview",   401),
    ("/api/v1/incident-severity/preview",   403),
    ("/api/v1/incident-severity/config",    401),
    ("/api/v1/incident-severity/config",    403),
    
)

# Content fields blanked for privacy (exact key names).
_SCRUB_KEYS: frozenset[str] = frozenset({
    "description", "controls", "mitigation_plan", "comments",
    "ai_insight", "root_cause", "title",
})

# Any key containing one of these is a secret, whatever its full name
# (access_token, new_pin, confirm_password, client_secret, api_key ...).
_SECRET_PARTS: tuple[str, ...] = ("token", "password", "pin", "secret", "key", "otp", "credential", "authorization")


def _is_secret(key: str) -> bool:
    k = key.lower()
    return k in _SCRUB_KEYS or any(part in k for part in _SECRET_PARTS)


_BODY_METHODS: frozenset[str] = frozenset({"POST", "PUT", "PATCH"})


def _scrub(body: object) -> object:
    """Blank secret and content fields at any depth, in objects and lists."""
    if isinstance(body, dict):
        return {
            k: "[redacted]" if _is_secret(str(k)) else _scrub(v)
            for k, v in body.items()
        }
    if isinstance(body, list):
        return [_scrub(v) for v in body]
    return body


async def _parse_body(request: Request) -> object | None:
    if request.method not in _BODY_METHODS:
        return None
    try:
        raw = await request.body()
        if not raw:
            return None
        return _scrub(json.loads(raw))
    except Exception:
        return None


# Strong references to pending log writes, so none is dropped before it runs.
_PENDING: set[asyncio.Task[None]] = set()


def error_detail_for(exc: BaseException) -> str:
    """Exception type and the first line of its message, cut to 300 characters.

    Only the first line: database errors add the SQL and its parameters on
    later lines, which can hold personal data.
    """
    first = str(exc).split("\n", 1)[0]
    return f"{type(exc).__name__}: {first}"[:300]


class ErrorLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.monotonic()
        crash: BaseException | None = None
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as exc:
            # Unhandled errors pass through here as exceptions; the outer
            # handler in main.py turns them into the 500 reply.
            crash = exc
            status_code = 500
        duration_ms = int((time.monotonic() - start) * 1000)

        if status_code < 400:
            return response

        path = request.url.path
        skip = any(path.startswith(p) and status_code == c for p, c in _SKIP)
        if not skip:
            tenant_id: str | None = getattr(request.state, "tenant_id", None)
            detail: str | None = (
                error_detail_for(crash) if crash is not None
                else getattr(request.state, "error_detail", None)
            )
            body = await _parse_body(request)
            method = request.method

            async def _persist() -> None:
                try:
                    async with AsyncSessionLocal() as db:
                        db.add(ApiErrorLog(
                            tenant_id=tenant_id,
                            method=method,
                            path=path,
                            status_code=status_code,
                            error_detail=detail,
                            request_body=body,
                            duration_ms=duration_ms,
                        ))
                        await db.commit()
                except Exception:
                    logger.warning("error log write failed | %s %s", method, path)

            task = asyncio.create_task(_persist())
            _PENDING.add(task)
            task.add_done_callback(_PENDING.discard)

        if crash is not None:
            raise crash
        return response
