from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_active_tenant, get_db
from app.schemas.dashboard import DashboardResponse
from app.services.dashboard import get_dashboard
from app.services.snapshot import write_monthly_snapshot
from app.services.ai_executive import generate_exec_insight
from app.schemas.dashboard import ExecInsightResponse

router = APIRouter(tags=["dashboard"])


@router.get(
    "/dashboard",
    response_model=None,
    summary="Main dashboard — KPIs, trends, snapshot delta, activity feed",
)
async def dashboard_endpoint(
    days: int = Query(default=90, ge=1, le=365),
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    """
    Single endpoint that returns all dashboard data for the authenticated tenant.
    Snapshot delta is embedded in the response (no separate call needed).
    The frontend renders risk, incident, or unified sections based on JWT claims.modules.
    """
    tenant_id = UUID(claims["active_tenant_id"])
    data = await get_dashboard(db, tenant_id, days=days)
    return {"data": data.model_dump(), "error": None, "meta": {"days": days}}


@router.post(
    "/snapshots/run",
    summary="Manually trigger a monthly snapshot for the current tenant",
)
async def run_snapshot(
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    """
    Writes a monthly snapshot for last month. Idempotent — skips if already written.
    Intended for manual trigger or backfill. The scheduler calls the service directly.
    """
    tenant_id = UUID(claims["active_tenant_id"])
    snap = await write_monthly_snapshot(db, tenant_id)
    return {
        "data": {
            "month_key": snap.month_key if snap else None,
            "written": snap is not None,
        },
        "error": None,
        "meta": {},
    }


@router.get(
    "/dashboard/exec-insights",
    response_model=None,
    summary="Generate AI executive insights summary and 30-day action plan",
)
async def exec_insights_endpoint(
    days: int = Query(default=90, ge=1, le=365),
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
):
    tenant_id = UUID(claims["active_tenant_id"])
    result = await generate_exec_insight(db, tenant_id, days=days)
    return {"data": result.model_dump(), "error": None, "meta": {}}