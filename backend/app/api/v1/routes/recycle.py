# app/api/v1/routes/recycle.py

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, get_active_tenant
from app.services import recycle as recycle_service

router = APIRouter(prefix="/recycle", tags=["recycle"])


@router.get("")
async def list_bin(
    item_type: str | None = Query(None),
    db: AsyncSession      = Depends(get_db),
    claims: dict          = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])
    items = await recycle_service.list_bin(db, tenant_id, item_type)
    return {"data": items, "error": None, "meta": {"total": len(items)}}


@router.get("/count")
async def get_count(
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])
    count = await recycle_service.get_bin_count(db, tenant_id)
    return {"data": {"count": count}, "error": None, "meta": {}}


@router.post("/{bin_id}/restore")
async def restore_item(
    bin_id: UUID,
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])
    result = await recycle_service.restore_item(
        db, tenant_id, bin_id, claims["email"]
    )
    return {"data": result, "error": None, "meta": {}}


@router.delete("/{bin_id}")
async def permanent_delete(
    bin_id: UUID,
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])
    await recycle_service.permanent_delete(db, tenant_id, bin_id, deleted_by=str(claims.get("email") or ""))
    return {
        "data": {"message": "Item permanently deleted"},
        "error": None,
        "meta": {},
    }