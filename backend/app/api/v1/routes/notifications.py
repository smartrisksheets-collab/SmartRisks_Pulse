# app/api/v1/routes/notifications.py

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from app.core.rate_limit import limiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_active_tenant, get_db
from app.schemas.settings import NotificationPrefResponse, NotificationPrefUpdate
from app.services import settings as settings_svc

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/prefs", response_model=dict)
@limiter.limit("60/minute")
async def get_prefs(
    request: Request,
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    tenant_id = UUID(claims["active_tenant_id"])
    user_email = str(claims["email"])
    result = await settings_svc.get_notification_prefs(db, tenant_id, user_email)
    return {"data": result.model_dump(), "error": None, "meta": {}}


@router.patch("/prefs", response_model=dict)
@limiter.limit("20/minute")
async def update_prefs(
    request: Request,
    payload: NotificationPrefUpdate,
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    tenant_id = UUID(claims["active_tenant_id"])
    user_email = str(claims["email"])
    result = await settings_svc.update_notification_prefs(
        db, tenant_id, user_email, payload
    )
    return {"data": result.model_dump(), "error": None, "meta": {}}