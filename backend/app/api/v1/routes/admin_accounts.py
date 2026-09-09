from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.admin_deps import get_current_admin, require_super_admin
from app.models.admin_account import AdminAccount
from app.schemas.admin import AdminAccountCreate, AdminAccountUpdate
from app.services import admin_panel as panel_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/platform-users")
async def list_platform_users(
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await panel_service.list_platform_users(db)
    return {"data": result, "error": None, "meta": {}}


@router.get("/admin-accounts")
async def list_admin_accounts(
    admin: AdminAccount = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await panel_service.list_admin_accounts(db)
    return {"data": result, "error": None, "meta": {}}


@router.post("/admin-accounts")
async def create_admin_account(
    payload: AdminAccountCreate,
    admin: AdminAccount = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await panel_service.create_admin_account(
        payload=payload,
        creator_id=str(admin.id),
        db=db,
    )
    await db.commit()
    return {"data": result, "error": None, "meta": {}}


@router.patch("/admin-accounts/{target_id}")
async def update_admin_account(
    target_id: str,
    payload: AdminAccountUpdate,
    admin: AdminAccount = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await panel_service.update_admin_account(
        target_id=target_id,
        payload=payload,
        actor_id=str(admin.id),
        db=db,
    )
    await db.commit()
    return {"data": result, "error": None, "meta": {}}