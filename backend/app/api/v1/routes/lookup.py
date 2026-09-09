# app/api/v1/routes/lookup.py

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from app.core.rate_limit import limiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, get_active_tenant, require_permission
from app.schemas.lookup import LookupPatch
from app.services import lookup as lookup_service

router = APIRouter(prefix="/lookups", tags=["lookups"])


@router.get("")
@limiter.limit("60/minute")
async def get_lookups(
    request: Request,
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])
    result = await lookup_service.get_lookups(db, tenant_id)
    return {"data": result, "error": None, "meta": {}}


@router.get("/usage")
@limiter.limit("60/minute")
async def check_usage(
    request: Request,
    field: str = Query(...),
    value: str = Query(...),
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])
    count = await lookup_service.check_lookup_usage(db, tenant_id, field, value)
    return {"data": {"field": field, "value": value, "count": count}, "error": None, "meta": {}}


@router.patch("")
@limiter.limit("20/minute")
async def patch_lookups(
    request: Request,
    payload: LookupPatch,
    db: AsyncSession      = Depends(get_db),
    claims: dict          = Depends(require_permission("manage_settings")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    result = await lookup_service.patch_lookups(db, tenant_id, payload)
    return {"data": result, "error": None, "meta": {}}