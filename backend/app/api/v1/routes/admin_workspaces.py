from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.admin_deps import get_current_admin
from app.models.admin_account import AdminAccount
from app.schemas.admin import AdminWorkspaceUpdate
from app.services import admin_panel as panel_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/workspaces")
async def list_workspaces(
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await panel_service.list_workspaces(db)
    return {"data": result, "error": None, "meta": {}}


@router.patch("/workspaces/{tenant_id}")
async def update_workspace(
    tenant_id: str,
    payload: AdminWorkspaceUpdate,
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    await panel_service.update_workspace(
        tenant_id=tenant_id,
        payload=payload,
        admin_id=str(admin.id),
        db=db,
    )
    await db.commit()
    return {"data": {"message": "Workspace updated."}, "error": None, "meta": {}}