# app/api/v1/routes/settings.py

from uuid import UUID

from fastapi import APIRouter, Depends, File, Request, UploadFile
from app.core.rate_limit import limiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_active_tenant, get_db, require_permission
from app.schemas.settings import PINSet, SettingsResponse, SettingsUpdate
from app.services import settings as settings_svc

router = APIRouter(prefix="/settings", tags=["settings"])

# Fields only the settings manager may read. Everyone else receives them blank.
_OWNER_ONLY_FIELDS: tuple[str, ...] = (
    "alert_recipients",
    "brief_recipients",
    "ai_policy",
    "ai_policy_industry",
    "ai_policy_tone",
    "ai_policy_sensitivity",
    "ai_policy_extra",
)

# Role permission settings. Readable by settings managers and user managers only.
_PERM_FIELDS: tuple[str, ...] = tuple(
    k for k in SettingsResponse.model_fields if k.startswith("perm_")
)


@router.get("", response_model=dict)
@limiter.limit("60/minute")
async def get_settings(
    request: Request,
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    tenant_id = UUID(claims["active_tenant_id"])
    result = await settings_svc.get_settings(db, tenant_id)
    data = result.model_dump()
    perms = claims.get("permissions", {})
    if not perms.get("manage_settings"):
        for key in _OWNER_ONLY_FIELDS:
            data[key] = ""
        if not perms.get("manage_users"):
            for key in _PERM_FIELDS:
                data[key] = False
    return {"data": data, "error": None, "meta": {}}


@router.patch("", response_model=dict)
@limiter.limit("20/minute")
async def update_settings(
    request: Request,
    payload: SettingsUpdate,
    claims: dict = Depends(require_permission("manage_settings")),
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
    claims: dict = Depends(require_permission("manage_settings")),
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
    claims: dict = Depends(require_permission("manage_settings")),
) -> dict:
    tenant_id = UUID(claims["active_tenant_id"])
    content   = await file.read(settings_svc.LOGO_MAX_BYTES + 1)
    logo_url  = await settings_svc.upload_logo(content, str(tenant_id))
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