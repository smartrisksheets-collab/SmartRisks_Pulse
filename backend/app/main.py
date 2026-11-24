import asyncio
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler # type: ignore
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from slowapi.errors import RateLimitExceeded #type: ignore
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.core.config import settings
from app.core.logging_config import configure_logging, request_id_var
from app.db.session import AsyncSessionLocal
from app.core.rate_limit import limiter
from app.core.exceptions import (
    InvalidCredentialsError,
    InvalidTokenError,
    InvalidPINError,
    PermissionDeniedError,
    TrialExpiredError,
    PlanExpiredError,
    QuotaExceededError,
    ValidationError,
    ServerError,
    WorkspaceLimitError,
    DuplicateResourceError,
    ResourceNotFoundError,
)
from app.middleware.tenant import TenantMiddleware
from app.middleware.error_log import ErrorLogMiddleware, error_detail_for
from app.middleware.request_id import RequestIdMiddleware
from app.api.v1.routes.admin_auth import router as admin_auth_router
from app.api.v1.routes.admin_overview import router as admin_overview_router
from app.api.v1.routes.admin_workspaces import router as admin_workspaces_router
from app.api.v1.routes.admin_accounts import router as admin_accounts_router
from app.api.v1.routes.admin_errors import router as admin_errors_router
from app.api.v1.routes.admin_payments import router as admin_payments_router
from app.api.v1.routes import (
    auth, workspaces, users, risks, recycle, incidents, lookup,
    dashboard, reports, settings as settings_router, notifications, external,
)

from app.api.v1.routes.brief import router as brief_router
from app.api.v1.routes.matrix import router as matrix_router
from app.api.v1.routes.audit import router as audit_router
from app.api.v1.routes.presence import router as presence_router
from app.api.v1.routes.feedback import router as feedback_router
from app.api.v1.routes.appetite import router as appetite_router
from app.api.v1.routes.submissions import router as submissions_router
from app.api.v1.routes.incident_severity import router as incident_severity_router
from app.api.v1.routes.help import router as help_router
from app.scheduler.jobs import (
    job_incident_escalation,
    job_daily_snapshot,
    job_monthly_snapshot,
    job_recycle_purge,
    job_freshness_update,
    job_brief_send,
    job_orphan_logo_sweep,
    job_trial_cleanup,
    job_help_gaps_report,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    from app.services.report_fonts import register_fonts
    register_fonts()

    from app.scheduler.single_run import single_run

    scheduler = AsyncIOScheduler()

    # Daily per-risk snapshot — midnight UTC
    scheduler.add_job(single_run("daily_snapshot", job_daily_snapshot),   "cron", hour=0,  minute=0,  id="daily_snapshot")
    # Monthly aggregate snapshot — 00:05 on 1st of month
    scheduler.add_job(single_run("monthly_snapshot", job_monthly_snapshot), "cron", hour=0,  minute=5,  day=1, id="monthly_snapshot")
    # Recycle bin purge — 02:00 UTC
    scheduler.add_job(single_run("recycle_purge", job_recycle_purge),    "cron", hour=2,  minute=0,  id="recycle_purge")
    # Orphaned logo sweep, 03:00 UTC on Sundays
    scheduler.add_job(single_run("orphan_logo_sweep", job_orphan_logo_sweep), "cron", day_of_week="sun", hour=3, minute=0, id="orphan_logo_sweep")
    # Freshness recompute — 06:00 UTC
    scheduler.add_job(single_run("freshness_update", job_freshness_update), "cron", hour=6,  minute=0,  id="freshness_update")
    # Brief dispatch — every hour 07:00 to 10:00 UTC; each job checks per-tenant send time
    scheduler.add_job(single_run("brief_send", job_brief_send),        "cron", minute=0,  id="brief_send")
    scheduler.add_job(single_run("incident_escalation", job_incident_escalation), "cron", minute=0,              id="incident_escalation")
    scheduler.add_job(single_run("trial_cleanup", job_trial_cleanup),        "cron", hour=5, minute=0,      id="trial_cleanup")
    # Ask Pulse unanswered questions, 07:30 UTC on Mondays
    scheduler.add_job(single_run("help_gaps_report", job_help_gaps_report), "cron", day_of_week="mon", hour=7, minute=30, id="help_gaps_report")

    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


# Tests keep pytest's own log capture.
if settings.APP_ENV != "test":
    configure_logging(settings.LOG_LEVEL)
logger = logging.getLogger("app")


app = FastAPI(
    title="SmartRisk Pulse API",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.APP_ENV == "development" else None,
    redoc_url=None,
)

app.state.limiter = limiter

app.add_middleware(ErrorLogMiddleware)
app.add_middleware(TenantMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIdMiddleware)  # outermost, so every log line has the id

_EXCEPTION_MAP = {
    InvalidCredentialsError: 401,
    InvalidTokenError: 401,
    InvalidPINError: 401,
    PermissionDeniedError: 403,
    TrialExpiredError: 403,
    PlanExpiredError: 403,
    ResourceNotFoundError: 404,
    DuplicateResourceError: 409,
    ValidationError: 422,
    ServerError: 500,
    QuotaExceededError: 429,
    WorkspaceLimitError: 429,
}

for _exc_class, _status in _EXCEPTION_MAP.items():

    @app.exception_handler(_exc_class)
    async def _handler(request: Request, exc: Exception, _code=_status):
        request.state.error_detail = error_detail_for(exc)
        return JSONResponse(
            {"data": None, "error": str(exc), "meta": {}},
            status_code=_code,
        )


def _envelope(status_code: int, message: str, request: Request, detail: str,
              headers: dict[str, str] | None = None, meta: dict | None = None) -> JSONResponse:
    request.state.error_detail = detail[:300]
    return JSONResponse(
        {"data": None, "error": message, "meta": meta or {}},
        status_code=status_code,
        headers=headers,
    )


@app.exception_handler(StarletteHTTPException)
async def _http_exception_handler(request: Request, exc: StarletteHTTPException):
    """HTTPException (raised in a few routes, and by FastAPI for 404/405) in the envelope."""
    message = exc.detail if isinstance(exc.detail, str) else "Request failed."
    return _envelope(exc.status_code, message, request, f"HTTPException: {message}",
                     headers=dict(exc.headers) if exc.headers else None)


def _validation_message(errors: list[dict]) -> str:
    """Readable lines like the frontend used to build: "field: problem", at most 4."""
    counts: dict[str, int] = {}
    for e in errors:
        loc = e.get("loc") or ()
        field = str(loc[-1]) if loc else "field"
        msg = str(e.get("msg") or "invalid")
        if msg.lower().startswith("value error, "):
            msg = msg[len("value error, "):]
        key = f"{field}: {msg}"
        counts[key] = counts.get(key, 0) + 1
    lines = [f"{k} ({n} rows)" if n > 1 else k for k, n in list(counts.items())[:4]]
    extra = f" +{len(counts) - 4} more issue(s)" if len(counts) > 4 else ""
    return "\n".join(lines) + extra if lines else "Some details could not be accepted."


@app.exception_handler(RequestValidationError)
async def _request_validation_handler(request: Request, exc: RequestValidationError):
    errors = list(exc.errors())
    # The raw input is left out of the reply and the log: it can hold passwords.
    detail = [{"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in errors]
    message = _validation_message(errors)
    return _envelope(422, message, request, f"RequestValidationError: {message}",
                     meta={"detail": jsonable_encoder(detail)})


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return _envelope(429, "Too many requests. Please wait a minute and try again.", request,
                     f"RateLimitExceeded: {exc.detail}")


@app.exception_handler(IntegrityError)
async def _integrity_handler(request: Request, exc: IntegrityError):
    """A save the database refused (duplicate or changed record) is a 409 the user can retry."""
    logger.warning("integrity error | %s %s | %s", request.method, request.url.path, error_detail_for(exc))
    return _envelope(409, "This record already exists or was changed by someone else. Please refresh and try again.",
                     request, error_detail_for(exc))


@app.exception_handler(Exception)
async def _unhandled_handler(request: Request, exc: Exception):
    # This handler runs outside RequestIdMiddleware, so put the id back for the log line.
    rid = str(getattr(request.state, "request_id", "-"))
    token = request_id_var.set(rid)
    try:
        logger.exception("unhandled error | %s %s", request.method, request.url.path)
    finally:
        request_id_var.reset(token)
    return JSONResponse(
        {"data": None, "error": "An unexpected error occurred. Please try again.", "meta": {"request_id": rid}},
        status_code=500,
        headers={"X-Request-ID": rid},
    )


app.include_router(auth.router, prefix="/api/v1")
app.include_router(workspaces.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(risks.router, prefix="/api/v1")
app.include_router(recycle.router, prefix="/api/v1")
app.include_router(incidents.router, prefix="/api/v1")
app.include_router(lookup.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(reports.router,      prefix="/api/v1")
app.include_router(settings_router.router, prefix="/api/v1")
app.include_router(notifications.router,   prefix="/api/v1")
app.include_router(external.router,        prefix="/api/v1")
app.include_router(brief_router,           prefix="/api/v1")
app.include_router(audit_router,           prefix="/api/v1")
app.include_router(presence_router,        prefix="/api/v1")
app.include_router(matrix_router,          prefix="/api/v1")
app.include_router(feedback_router,        prefix="/api/v1")
app.include_router(appetite_router,        prefix="/api/v1")
app.include_router(incident_severity_router, prefix="/api/v1")
app.include_router(submissions_router,     prefix="/api/v1")
app.include_router(help_router,            prefix="/api/v1")

app.include_router(admin_auth_router,       prefix="/api")
app.include_router(admin_overview_router,   prefix="/api")
app.include_router(admin_workspaces_router, prefix="/api")
app.include_router(admin_accounts_router,   prefix="/api")
app.include_router(admin_errors_router,     prefix="/api")
app.include_router(admin_payments_router,   prefix="/api")


@app.get("/api/health")
@limiter.limit("60/minute")
async def health(request: Request) -> JSONResponse:
    """Liveness plus a database round trip, for uptime monitors."""
    try:
        async with AsyncSessionLocal() as db:
            await asyncio.wait_for(db.execute(text("SELECT 1")), timeout=5)
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "database": "unreachable", "env": settings.APP_ENV},
        )
    return JSONResponse(content={"status": "ok", "database": "ok", "env": settings.APP_ENV})