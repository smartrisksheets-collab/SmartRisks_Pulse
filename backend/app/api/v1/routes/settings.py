# app/api/v1/routes/settings.py

from uuid import UUID

from fastapi import APIRouter, Depends, File, Request, UploadFile
from app.core.rate_limit import limiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_active_tenant, get_db
from app.schemas.settings import PINSet, SettingsResponse, SettingsUpdate
from app.services import settings as settings_svc

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=dict)
@limiter.limit("60/minute")
async def get_settings(
    request: Request,
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    tenant_id = UUID(claims["active_tenant_id"])
    result = await settings_svc.get_settings(db, tenant_id)
    return {"data": result.model_dump(), "error": None, "meta": {}}


@router.patch("", response_model=dict)
@limiter.limit("20/minute")
async def update_settings(
    request: Request,
    payload: SettingsUpdate,
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    tenant_id = UUID(claims["active_tenant_id"])
    result = await settings_svc.update_settings(db, tenant_id, payload)
    return {"data": result.model_dump(), "error": None, "meta": {}}


@router.post("/pin", response_model=dict)
@limiter.limit("10/minute")
async def set_pin(
    request: Request,
    payload: PINSet,
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    tenant_id = UUID(claims["active_tenant_id"])
    result = await settings_svc.set_pin(db, tenant_id, payload)
    return {"data": result, "error": None, "meta": {}}


@router.post("/logo", response_model=dict)
@limiter.limit("5/minute")
async def upload_logo(
    request: Request,
    file: UploadFile = File(...),
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    tenant_id   = UUID(claims["active_tenant_id"])
    current     = await settings_svc.get_settings(db, tenant_id)
    content      = await file.read()
    content_type = file.content_type or "application/octet-stream"
    filename     = file.filename or "logo"
    logo_url = await settings_svc.upload_logo(
        content, content_type, filename, current.logo_url
    )
    return {"data": {"logo_url": logo_url}, "error": None, "meta": {}}


@router.delete("/pin", response_model=dict)
@limiter.limit("10/minute")
async def remove_pin(
    request: Request,
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    tenant_id = UUID(claims["active_tenant_id"])
    role = str(claims.get("role", ""))
    result = await settings_svc.remove_pin(db, tenant_id, role)
    return {"data": result, "error": None, "meta": {}}