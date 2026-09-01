from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler # type: ignore
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler #type: ignore
from slowapi.errors import RateLimitExceeded #type: ignore
from app.core.config import settings
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
from app.scheduler.jobs import (
    job_daily_snapshot,
    job_monthly_snapshot,
    job_recycle_purge,
    job_freshness_update,
    job_brief_send,
    job_orphan_logo_sweep,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    scheduler = AsyncIOScheduler()

    # Daily per-risk snapshot — midnight UTC
    scheduler.add_job(job_daily_snapshot,   "cron", hour=0,  minute=0,  id="daily_snapshot")
    # Monthly aggregate snapshot — 00:05 on 1st of month
    scheduler.add_job(job_monthly_snapshot, "cron", hour=0,  minute=5,  day=1, id="monthly_snapshot")
    # Recycle bin purge — 02:00 UTC
    scheduler.add_job(job_recycle_purge,    "cron", hour=2,  minute=0,  id="recycle_purge")
    # Orphaned logo sweep, 03:00 UTC on Sundays
    scheduler.add_job(job_orphan_logo_sweep, "cron", day_of_week="sun", hour=3, minute=0, id="orphan_logo_sweep")
    # Freshness recompute — 06:00 UTC
    scheduler.add_job(job_freshness_update, "cron", hour=6,  minute=0,  id="freshness_update")
    # Brief dispatch — every hour 07:00 to 10:00 UTC; each job checks per-tenant send time
    scheduler.add_job(job_brief_send,       "cron", hour="7-10", minute=0, id="brief_send")

    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="SmartRisk Pulse API",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.APP_ENV == "development" else None,
    redoc_url=None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(TenantMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        return JSONResponse(
            {"data": None, "error": str(exc), "meta": {}},
            status_code=_code,
        )


@app.exception_handler(Exception)
async def _unhandled_handler(request: Request, exc: Exception):
    return JSONResponse(
        {"data": None, "error": "An unexpected error occurred. Please try again.", "meta": {}},
        status_code=500,
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
app.include_router(submissions_router,     prefix="/api/v1")

@app.get("/api/health")
async def health():
    return {"status": "ok", "env": settings.APP_ENV}