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
from datetime import date, timedelta
from app.core.exceptions import WorkspaceLimitError, ResourceNotFoundError

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

    account = (await db.execute(
        select(Account).where(Account.id == account_id)
    )).scalar_one_or_none()

    limit = int(account.max_workspaces) if account else 1  # type: ignore[arg-type]

    owned_count = await db.scalar(
        select(func.count()).select_from(Tenant).where(
            Tenant.created_by == account_id
        )
    )
    if owned_count >= limit:
        raise WorkspaceLimitError(
            f"Your plan allows a maximum of {limit} workspace(s). "
            f"Contact support to increase your limit."
        )

    ws_settings: dict = {}
    if payload.org_name:
        ws_settings["organization"] = payload.org_name

    is_enterprise = int(account.max_workspaces) > 1 if account else False  # type: ignore[arg-type]
    initial_expiry = date.today() + timedelta(days=365) if is_enterprise else None

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
        plan="PAID" if is_enterprise else "TRIAL",
        payment_active=is_enterprise,  # type: ignore[assignment]
        plan_expires_at=initial_expiry,  # type: ignore[assignment]
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