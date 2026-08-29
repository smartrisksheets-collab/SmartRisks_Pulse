# app/api/v1/routes/appetite.py

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_active_tenant, get_db, require_permission
from app.schemas.appetite import AppetiteThresholdUpsert
from app.services import appetite as appetite_svc

router = APIRouter(prefix="/appetite", tags=["appetite"])


@router.get("", response_model=dict)
async def get_appetites(
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    tenant_id = UUID(claims["active_tenant_id"])
    data = await appetite_svc.list_appetites(db, tenant_id)
    return {"data": [r.model_dump() for r in data], "error": None, "meta": {}}


@router.put("", response_model=dict)
async def upsert_appetite(
    payload: AppetiteThresholdUpsert,
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission("manage_settings")),
) -> dict:
    tenant_id = UUID(claims["active_tenant_id"])
    user_email = str(claims.get("email", ""))
    data = await appetite_svc.upsert_appetite(db, tenant_id, payload, user_email)
    return {"data": data.model_dump(), "error": None, "meta": {}}