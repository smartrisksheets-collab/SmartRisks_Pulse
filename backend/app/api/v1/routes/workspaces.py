from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from app.core.dependencies import get_db, get_current_account, get_active_tenant
from app.schemas.user import CreateWorkspaceRequest, WorkspaceResponse
from app.models.tenant import Tenant
from app.models.workspace_member import WorkspaceMember
from app.models.account import Account
from app.models.audit_log import AuditLog
from app.core.config import settings
from app.core.exceptions import WorkspaceLimitError, ResourceNotFoundError

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("")
async def list_workspaces(
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_current_account),
):
    account_id = UUID(claims["sub"])
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
    return {"data": data, "error": None, "meta": {}}


@router.post("")
async def create_workspace(
    payload: CreateWorkspaceRequest,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_current_account),
):
    account_id = UUID(claims["sub"])

    paid_count = await db.scalar(
        select(func.count()).select_from(Tenant).where(
            Tenant.created_by == account_id,
            Tenant.plan == "PAID",
        )
    )
    limit = settings.MAX_WORKSPACES_PAID if paid_count > 0 else settings.MAX_WORKSPACES_TRIAL

    owned_count = await db.scalar(
        select(func.count()).select_from(Tenant).where(
            Tenant.created_by == account_id
        )
    )
    if owned_count >= limit:
        raise WorkspaceLimitError(f"Your plan allows a maximum of {limit} owned workspace(s)")

    ws_settings: dict = {}
    if payload.org_name:
        ws_settings["organization"] = payload.org_name

    tenant = Tenant(
        name=payload.name,
        industry=payload.industry,
        org_size=payload.org_size,
        framework=payload.framework,
        timezone=payload.timezone,
        date_format=payload.date_format,
        currency_symbol=payload.currency or "₦",
        workspace_settings=ws_settings or None,
        created_by=account_id,
    )
    db.add(tenant)
    await db.flush()

    member = WorkspaceMember(
        account_id=account_id,
        tenant_id=tenant.id,
        role="Owner",
        status="ACTIVE",
        invited_by="SYSTEM",
    )
    db.add(member)
    db.add(AuditLog(
        tenant_id=tenant.id,
        user_email=claims["email"],
        action="CREATE_WORKSPACE",
        module="Workspace",
        record_id=str(tenant.id),
        summary=f"Created workspace: {payload.name}",
    ))
    await db.flush()

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