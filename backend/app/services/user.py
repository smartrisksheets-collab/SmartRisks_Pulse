import logging

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
from sqlalchemy import select, func
from uuid import UUID
from app.models.account import Account
from app.models.workspace_member import WorkspaceMember
from app.models.tenant import Tenant
from app.models.audit_log import AuditLog
from app.schemas.user import AddMemberRequest, UpdateMemberRequest
from app.core.exceptions import ResourceNotFoundError, DuplicateResourceError, QuotaExceededError, PermissionDeniedError
from app.core.config import settings
from app.services.email import send_invite_email
from app.services.invite import generate_invite_token


async def list_members(db: AsyncSession, tenant_id: UUID) -> list:
    result = await db.execute(
        select(WorkspaceMember, Account)
        .join(Account, Account.id == WorkspaceMember.account_id)
        .where(WorkspaceMember.tenant_id == tenant_id)
        .order_by(WorkspaceMember.created_at)
    )
    return result.all()


async def add_member(
    db: AsyncSession, tenant_id: UUID, payload: AddMemberRequest, invited_by: str
) -> WorkspaceMember:
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise ResourceNotFoundError(f"Workspace {tenant_id} not found")

    active_count = await db.scalar(
        select(func.count()).where(
            WorkspaceMember.tenant_id == tenant_id,
            WorkspaceMember.status == "ACTIVE"
        )
    )
    if active_count >= tenant.max_users:
        raise QuotaExceededError(f"User limit of {tenant.max_users} reached")

    account = await db.scalar(select(Account).where(Account.email == payload.email.lower()))
    if not account:
        account = Account(email=payload.email.lower(), name=payload.name)
        db.add(account)
        await db.flush()

    existing = await db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.account_id == account.id,
            WorkspaceMember.tenant_id == tenant_id
        )
    )
    if existing:
        raise DuplicateResourceError(f"{payload.email} is already a member of this workspace")

    member = WorkspaceMember(
        account_id=account.id,
        tenant_id=tenant_id,
        role=payload.role,
        status="ACTIVE",
        invited_by=invited_by,
    )
    db.add(member)
    db.add(AuditLog(
        tenant_id=tenant_id,
        user_email=invited_by,
        action="ADD_USER",
        module="Users",
        record_id=str(account.id),
        summary=f"Added {payload.email} as {payload.role}",
    ))
    await db.flush()

    try:
        invite_token = generate_invite_token(payload.email, tenant_id, payload.role)
        send_invite_email(
            to=payload.email,
            invitee_name=str(payload.name or ""),
            invited_by=invited_by,
            workspace_name=str(tenant.name or "SmartRisk"),
            role=payload.role,
            invite_link=f"{settings.FRONTEND_URL}/accept-invite?token={invite_token}",
        )
    except Exception:
        logger.warning("Invite email failed | to=%s", payload.email)

    return member


async def update_member(
    db: AsyncSession, tenant_id: UUID, member_id: UUID,
    payload: UpdateMemberRequest, updated_by: str
) -> WorkspaceMember:
    member = await db.get(WorkspaceMember, member_id)
    if not member or member.tenant_id != tenant_id:
        raise ResourceNotFoundError(f"Member {member_id} not found")

    if payload.role is not None:
        member.role = payload.role  # type: ignore[assignment]
    if payload.reset_permissions:
        member.permissions = None  # type: ignore[assignment]
    elif payload.permissions is not None:
        member.permissions = payload.permissions  # type: ignore[assignment]

    if payload.name is not None:
        account = await db.get(Account, member.account_id)
        if account:
            account.name = payload.name or None  # type: ignore[assignment]

    db.add(AuditLog(
        tenant_id=tenant_id,
        user_email=updated_by,
        action="UPDATE_USER",
        module="Users",
        record_id=str(member_id),
        summary=f"Updated member {member_id}: role={payload.role or 'unchanged'}",
    ))
    await db.flush()
    return member


async def deactivate_member(
    db: AsyncSession, tenant_id: UUID, member_id: UUID, deactivated_by: str
) -> None:
    member = await db.get(WorkspaceMember, member_id)
    if not member or member.tenant_id != tenant_id:
        raise ResourceNotFoundError(f"Member {member_id} not found")

    if member.role == "Owner":
        owner_count = await db.scalar(
            select(func.count()).where(
                WorkspaceMember.tenant_id == tenant_id,
                WorkspaceMember.role == "Owner",
                WorkspaceMember.status == "ACTIVE",
            )
        )
        if owner_count <= 1:
            raise PermissionDeniedError("Cannot deactivate the last Owner of a workspace")

    account = await db.get(Account, member.account_id)
    if account:
        account.token_version = (account.token_version or 1) + 1

    member.status = "DEACTIVATED"
    db.add(AuditLog(
        tenant_id=tenant_id,
        user_email=deactivated_by,
        action="DEACTIVATE_USER",
        module="Users",
        record_id=str(member_id),
        summary=f"Deactivated member {member_id}",
    ))
    await db.flush()


async def remove_member(
    db: AsyncSession, tenant_id: UUID, member_id: UUID, removed_by: str
) -> None:
    member = await db.get(WorkspaceMember, member_id)
    if not member or member.tenant_id != tenant_id:
        raise ResourceNotFoundError(f"Member {member_id} not found")

    if member.role == "Owner":
        owner_count = await db.scalar(
            select(func.count()).where(
                WorkspaceMember.tenant_id == tenant_id,
                WorkspaceMember.role == "Owner",
                WorkspaceMember.status == "ACTIVE",
            )
        )
        if owner_count <= 1:
            raise PermissionDeniedError("Cannot remove the last Owner of a workspace")

    account = await db.get(Account, member.account_id)
    if account:
        account.token_version = (account.token_version or 1) + 1  # type: ignore[assignment]

    email_snapshot = str(account.email if account else member_id)
    await db.delete(member)
    db.add(AuditLog(
        tenant_id=tenant_id,
        user_email=removed_by,
        action="REMOVE_USER",
        module="Users",
        record_id=str(member_id),
        summary=f"Removed {email_snapshot} from workspace",
    ))
    await db.flush()


async def reactivate_member(
    db: AsyncSession, tenant_id: UUID, member_id: UUID, reactivated_by: str
) -> WorkspaceMember:
    member = await db.get(WorkspaceMember, member_id)
    if not member or member.tenant_id != tenant_id:
        raise ResourceNotFoundError(f"Member {member_id} not found")

    tenant = await db.get(Tenant, tenant_id)
    active_count = await db.scalar(
        select(func.count()).where(
            WorkspaceMember.tenant_id == tenant_id,
            WorkspaceMember.status == "ACTIVE"
        )
    )
    if active_count >= tenant.max_users:
        raise QuotaExceededError(f"User limit of {tenant.max_users} reached")

    member.status = "ACTIVE"
    db.add(AuditLog(
        tenant_id=tenant_id,
        user_email=reactivated_by,
        action="REACTIVATE_USER",
        module="Users",
        record_id=str(member_id),
        summary=f"Reactivated member {member_id}",
    ))
    await db.flush()
    return member