from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.admin_deps import get_current_admin
from app.models.admin_account import AdminAccount
from app.services import admin_panel as panel_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/errors")
async def list_errors(
    status_code: int | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await panel_service.list_errors(db, status_code=status_code, limit=limit)
    return {"data": result, "error": None, "meta": {}}


@router.get("/errors/summary")
async def error_summary(
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await panel_service.get_error_summary(db)
    return {"data": result, "error": None, "meta": {}}


@router.get("/audit-log")
async def list_audit_log(
    limit: int = Query(default=100, le=500),
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await panel_service.list_admin_audit_log(db, limit=limit)
    return {"data": result, "error": None, "meta": {}}