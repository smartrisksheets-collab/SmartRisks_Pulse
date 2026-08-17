# app/api/v1/routes/risks.py

from uuid import UUID

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from app.core.rate_limit import limiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, get_active_tenant, require_module, require_permission
from app.db.session import AsyncSessionLocal
from app.services.settings import get_ai_config
from app.schemas.risk import (
    RiskCreate, RiskUpdate, BulkImportRequest,
    AIInsightRequest, RiskStatsResponse,
)
from app.services import risk as risk_service
from app.services import ai_risk as ai_risk_service

router = APIRouter(prefix="/risks", tags=["risks"])


@router.get("")
async def list_risks(
    page: int          = Query(1, ge=1),
    page_size: int     = Query(50, ge=1, le=1000),
    risk_id: str | None   = Query(None),
    category: str | None  = Query(None),
    level: str | None     = Query(None),
    treatment: str | None = Query(None),
    owner: str | None     = Query(None),
    search: str | None    = Query(None),
    db: AsyncSession   = Depends(get_db),
    claims: dict       = Depends(require_module("risk")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    result = await risk_service.list_risks(
        db, tenant_id, page, page_size,
        risk_id, category, level, treatment, owner, search,
    )
    return {
        "data": result.items,
        "error": None,
        "meta": {
            "total":     result.total,
            "page":      result.page,
            "page_size": result.page_size,
            "quota":     result.quota.model_dump(),
        },
    }


@router.post("/ai")
@limiter.limit("10/minute")
async def generate_ai_insights(
    request: Request,
    payload: AIInsightRequest,
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_permission("manage_risks")),
    _:       dict    = Depends(require_module("risk")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    result = await risk_service.bulk_import(db, tenant_id, payload, claims["email"])
    return {"data": result, "error": None, "meta": {}}


@router.post("/ai")
async def generate_ai_insights(
    payload: AIInsightRequest,
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_permission("generate_ai")),
    _:       dict    = Depends(require_module("risk")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    result = await ai_risk_service.generate_insights(
        db, tenant_id, payload, claims["email"]
    )
    return {"data": result, "error": None, "meta": {}}


@router.get("/stats", response_model=None)
async def get_stats(
    category:  str | None = Query(None),
    level:     str | None = Query(None),
    treatment: str | None = Query(None),
    owner:     str | None = Query(None),
    search:    str | None = Query(None),
    db: AsyncSession      = Depends(get_db),
    claims: dict          = Depends(require_module("risk")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    stats = await risk_service.get_stats(
        db, tenant_id, category, level, treatment, owner, search
    )
    return {"data": stats, "error": None, "meta": {}}


@router.get("/{risk_id}")
async def get_risk(
    risk_id: str,
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_module("risk")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    risk = await risk_service.get_risk(db, tenant_id, risk_id)
    return {"data": risk, "error": None, "meta": {}}


logger = logging.getLogger(__name__)


async def _auto_run_ai(tenant_id: UUID, risk_id: str, user_email: str) -> None:
    async with AsyncSessionLocal() as db:
        try:
            ai_cfg = await get_ai_config(db, tenant_id)
            if not ai_cfg['enabled'] or not ai_cfg['auto_run']:
                return
            req = AIInsightRequest(
                target='selected',
                risk_ids=[risk_id],
                confidence=ai_cfg['confidence'],
                overwrite=False,
            )
            await ai_risk_service.generate_insights(db, tenant_id, req, user_email)
            await db.commit()
        except Exception as exc:
            logger.error('auto_run_ai failed | risk=%s | %s', risk_id, exc)


@router.post("")
@limiter.limit("60/minute")
async def create_risk(
    request:          Request,
    payload:          RiskCreate,
    background_tasks: BackgroundTasks,
    db:               AsyncSession = Depends(get_db),
    claims:           dict         = Depends(require_permission("manage_risks")),
    _:                dict         = Depends(require_module("risk")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    risk = await risk_service.create_risk(db, tenant_id, payload, claims["email"])
    background_tasks.add_task(_auto_run_ai, tenant_id, risk.id, claims["email"])
    return {"data": risk, "error": None, "meta": {}}


@router.patch("/{risk_id}")
@limiter.limit("60/minute")
async def update_risk(
    request: Request,
    risk_id: str,
    payload: RiskUpdate,
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_permission("manage_risks")),
    _:       dict    = Depends(require_module("risk")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    risk = await risk_service.update_risk(db, tenant_id, risk_id, payload, claims["email"])
    return {"data": risk, "error": None, "meta": {}}


@router.delete("/{risk_id}")
@limiter.limit("60/minute")
async def delete_risk(
    request: Request,
    risk_id: str,
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_permission("manage_risks")),
    _:       dict    = Depends(require_module("risk")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    await risk_service.delete_risk(db, tenant_id, risk_id, claims["email"])
    return {
        "data": {"message": f"Risk {risk_id} moved to recycle bin"},
        "error": None,
        "meta": {},
    }