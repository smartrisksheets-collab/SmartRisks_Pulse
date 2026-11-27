from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from app.core.dependencies import get_db, get_current_account, get_active_tenant
from app.schemas.user import CreateWorkspaceRequest, WorkspaceResponse
from app.models.tenant import Tenant
from app.models.workspace_member import WorkspaceMember
from app.models.account import Account
from app.core.exceptions import ResourceNotFoundError
from app.services.onboarding import create_workspace as create_workspace_for_account

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("")
async def list_workspaces(
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_current_account),
):
    account_id = UUID(claims["sub"])

    account = (await db.execute(
        select(Account).where(Account.id == account_id)
    )).scalar_one_or_none()

    max_workspaces = int(account.max_workspaces) if account else 1  # type: ignore[arg-type]

    owned_count = await db.scalar(
        select(func.count()).select_from(Tenant).where(
            Tenant.created_by == account_id
        )
    ) or 0

    result = await db.execute(
        select(Tenant, WorkspaceMember)
        .join(WorkspaceMember, WorkspaceMember.tenant_id == Tenant.id)
        .where(WorkspaceMember.account_id == account_id)
        .where(WorkspaceMember.status == "ACTIVE")
    )
    rows = result.all()
    data = [
        {**WorkspaceResponse.model_validate(t).model_dump(), "role": str(m.role or "Analyst")}
        for t, m in rows
    ]
    return {
        "data": data,
        "error": None,
        "meta": {"owned": int(owned_count), "limit": max_workspaces},
    }


@router.post("")
async def create_workspace(
    payload: CreateWorkspaceRequest,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_current_account),
):
    account_id = UUID(claims["sub"])
    tenant = await create_workspace_for_account(db, account_id, str(claims["email"]), payload)
    return {"data": WorkspaceResponse.model_validate(tenant), "error": None, "meta": {}}


@router.get("/{tenant_id}")
async def get_workspace(
    tenant_id: UUID,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_active_tenant),
):
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise ResourceNotFoundError(f"Workspace {tenant_id} not found")
    return {"data": WorkspaceResponse.model_validate(tenant), "error": None, "meta": {}}