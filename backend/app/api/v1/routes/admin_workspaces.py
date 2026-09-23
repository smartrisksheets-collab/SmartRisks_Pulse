from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.admin_deps import get_current_admin
from app.core.exceptions import PermissionDeniedError, ResourceNotFoundError
from app.models.admin_account import AdminAccount
from app.models.tenant import Tenant
from app.schemas.admin import AdminWorkspaceUpdate, AdminTrialExtend
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


@router.post("/workspaces/{tenant_id}/extend-trial")
async def extend_trial(
    tenant_id: str,
    payload: AdminTrialExtend,
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    new_end = await panel_service.extend_trial(
        tenant_id=tenant_id,
        days=payload.days,
        admin_id=str(admin.id),
        db=db,
    )
    await db.commit()
    return {"data": {"trial_ends_at": new_end.isoformat()}, "error": None, "meta": {}}


@router.delete("/workspaces/{tenant_id}")
async def delete_workspace(
    tenant_id: str,
    _: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    tenant = (await db.execute(
        select(Tenant).where(Tenant.id == UUID(tenant_id))
    )).scalar_one_or_none()

    if tenant is None:
        raise ResourceNotFoundError("Workspace not found.")

    if str(tenant.plan or "").upper() != "TRIAL":
        raise PermissionDeniedError(
            "Only TRIAL workspaces can be deleted from the admin panel. "
            "Paid workspaces must be suspended, not deleted."
        )

    await db.execute(delete(Tenant).where(Tenant.id == UUID(tenant_id)))
    await db.commit()
    return {"data": {"deleted": True}, "error": None, "meta": {}}