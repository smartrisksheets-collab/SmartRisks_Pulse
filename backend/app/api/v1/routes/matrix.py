# app/api/v1/routes/matrix.py

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, get_active_tenant, require_permission
from uuid import UUID

from app.schemas.matrix_config import MatrixConfigResponse, MatrixConfigUpdate
from app.services import matrix_config as matrix_service

router = APIRouter(prefix="/matrix-config", tags=["matrix"])


@router.get("", response_model=dict)
async def get_matrix_config(
    claims: dict = Depends(get_active_tenant),
    db:     AsyncSession = Depends(get_db),
):
    tenant_id = UUID(claims["active_tenant_id"])
    data = await matrix_service.get_config(db, tenant_id)
    return {"data": data.model_dump(), "error": None, "meta": {}}


@router.put("", response_model=dict)
async def update_matrix_config(
    payload: MatrixConfigUpdate,
    claims:  dict = Depends(get_active_tenant),
    db:      AsyncSession = Depends(get_db),
    _:       None = Depends(require_permission("manage_settings")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    data = await matrix_service.update_config(db, tenant_id, payload)
    return {"data": data.model_dump(), "error": None, "meta": {}}