# app/api/v1/routes/appetite.py

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from app.core.rate_limit import limiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_active_tenant, get_db, require_permission
from app.schemas.appetite import AppetiteThresholdUpsert
from app.services import appetite as appetite_svc
from app.core.exceptions import ResourceNotFoundError

router = APIRouter(prefix="/appetite", tags=["appetite"])


@router.get("", response_model=dict)
@limiter.limit("60/minute")
async def get_appetites(
    request: Request,
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    tenant_id = UUID(claims["active_tenant_id"])
    data = await appetite_svc.list_appetites(db, tenant_id)
    return {"data": [r.model_dump() for r in data], "error": None, "meta": {}}


@router.put("", response_model=dict)
@limiter.limit("10/minute")
async def upsert_appetite(
    request: Request,
    payload: AppetiteThresholdUpsert,
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission("manage_settings")),
) -> dict:
    tenant_id = UUID(claims["active_tenant_id"])
    user_email = str(claims.get("email", ""))
    data = await appetite_svc.upsert_appetite(db, tenant_id, payload, user_email)
    return {"data": data.model_dump(), "error": None, "meta": {}}


@router.delete("/{category}", response_model=dict)
@limiter.limit("10/minute")
async def delete_appetite(
    request: Request,
    category: str,
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission("manage_settings")),
) -> dict:
    tenant_id = UUID(claims["active_tenant_id"])
    deleted = await appetite_svc.delete_appetite(db, tenant_id, category)
    if not deleted:
        raise ResourceNotFoundError("Threshold not found for this category.")
    return {"data": {"deleted": True}, "error": None, "meta": {}}