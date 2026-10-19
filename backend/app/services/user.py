import logging

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
from sqlalchemy import select, func
from uuid import UUID
from app.models.account import Account
from app.models.account_identity import AccountIdentity
from app.models.workspace_member import WorkspaceMember
from app.models.tenant import Tenant
from app.models.audit_log import AuditLog
from app.schemas.user import AddMemberRequest, UpdateMemberRequest
from app.core.exceptions import ResourceNotFoundError, DuplicateResourceError, QuotaExceededError, PermissionDeniedError, ValidationError
from app.services.auth import _PERM_MAP, _role_permissions
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


_PERM_KEYS: frozenset[str] = frozenset(_PERM_MAP) | {"manage_settings", "review_resolve"}
_ADMIN_ONLY_PERMS: frozenset[str] = frozenset({"manage_settings", "manage_users"})


async def get_workspace_settings(db: AsyncSession, tenant_id: UUID) -> dict:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        return {}
    return dict(tenant.workspace_settings or {})  # type: ignore[arg-type]


def role_permissions(role: str, ws: dict) -> dict[str, bool]:
    """Role defaults for this workspace, using the same rules as the login token."""
    return _role_permissions(role, ws)


def effective_permissions(member: WorkspaceMember, ws: dict) -> dict[str, bool]:
    """What this member can actually do: custom permissions if set, otherwise role defaults."""
    if member.permissions is not None:
        return dict(member.permissions)  # type: ignore[arg-type]
    return _role_permissions(str(member.role or "Analyst"), ws)


async def sign_in_methods(db: AsyncSession, account_ids: list[UUID]) -> dict[str, set[str]]:
    """Sign-in methods per account, keyed by account id string."""
    out: dict[str, set[str]] = {}
    if not account_ids:
        return out
    result = await db.execute(
        select(AccountIdentity.account_id, AccountIdentity.provider)
        .where(AccountIdentity.account_id.in_(account_ids))
    )
    for account_id, provider in result.all():
        out.setdefault(str(account_id), set()).add(str(provider))
    return out


def sign_in_status(providers: set[str]) -> dict[str, str | bool]:
    """The one definition of a member's sign-in label. No method yet means the invite was never accepted."""
    if not providers:
        return {"label": "Invite pending", "pending": True}
    if providers >= {"password", "google"}:
        return {"label": "Password + Google", "pending": False}
    if "google" in providers:
        return {"label": "Google", "pending": False}
    return {"label": "Password", "pending": False}


async def _active_owner_count(db: AsyncSession, tenant_id: UUID) -> int:
    count = await db.scalar(
        select(func.count()).where(
            WorkspaceMember.tenant_id == tenant_id,
            WorkspaceMember.role == "Owner",
            WorkspaceMember.status == "ACTIVE",
        )
    )
    return int(count or 0)


def _guard_target(member: WorkspaceMember, actor_role: str, actor_account_id: str, action: str) -> None:
    if str(member.account_id) == actor_account_id:
        raise PermissionDeniedError(f"You cannot {action} your own account.")
    if str(member.role) == "Owner" and actor_role != "Owner":
        raise PermissionDeniedError(f"Only an Admin can {action} another Admin.")


async def add_member(
    db: AsyncSession, tenant_id: UUID, payload: AddMemberRequest, invited_by: str,
    actor_role: str,
) -> WorkspaceMember:
    if payload.role == "Owner" and actor_role != "Owner":
        raise PermissionDeniedError("Only an Admin can invite another Admin.")
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
        account = Account(email=payload.email.lower(), name=payload.name, created_via="invite")
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
            invite_link=f"{settings.FRONTEND_URL.split(',')[0].strip()}/accept-invite?token={invite_token}",
        )
    except Exception:
        logger.warning("Invite email failed | to=%s", payload.email)

    return member


async def update_member(
    db: AsyncSession, tenant_id: UUID, member_id: UUID,
    payload: UpdateMemberRequest, updated_by: str,
    actor_role: str, actor_account_id: str,
) -> WorkspaceMember:
    member = await db.get(WorkspaceMember, member_id)
    if not member or member.tenant_id != tenant_id:
        raise ResourceNotFoundError(f"Member {member_id} not found")

    changes_access = (
        (payload.role is not None and payload.role != str(member.role))
        or payload.permissions is not None
        or payload.reset_permissions
    )
    if changes_access:
        _guard_target(member, actor_role, actor_account_id, "change access for")
        if actor_role != "Owner" and payload.role == "Owner":
            raise PermissionDeniedError("Only an Admin can grant the Admin role.")
    if payload.permissions is not None:
        unknown = set(payload.permissions) - _PERM_KEYS
        if unknown:
            raise ValidationError(f"Unknown permissions: {', '.join(sorted(unknown))}")
        if actor_role != "Owner" and any(payload.permissions.get(k) for k in _ADMIN_ONLY_PERMS):
            raise PermissionDeniedError("Only an Admin can grant Manage Settings or Manage Users.")
    if (
        str(member.role) == "Owner" and payload.role is not None and payload.role != "Owner"
        and str(member.status) == "ACTIVE" and await _active_owner_count(db, tenant_id) <= 1
    ):
        raise PermissionDeniedError("Cannot change the role of the last Admin.")

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
    db: AsyncSession, tenant_id: UUID, member_id: UUID, deactivated_by: str,
    actor_role: str, actor_account_id: str,
) -> None:
    member = await db.get(WorkspaceMember, member_id)
    if not member or member.tenant_id != tenant_id:
        raise ResourceNotFoundError(f"Member {member_id} not found")
    _guard_target(member, actor_role, actor_account_id, "deactivate")

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
    db: AsyncSession, tenant_id: UUID, member_id: UUID, removed_by: str,
    actor_role: str, actor_account_id: str,
) -> None:
    member = await db.get(WorkspaceMember, member_id)
    if not member or member.tenant_id != tenant_id:
        raise ResourceNotFoundError(f"Member {member_id} not found")
    _guard_target(member, actor_role, actor_account_id, "remove")

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