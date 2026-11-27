"""
Join by email domain.

An Admin switches it on for their workspace. The domain is always the Admin's
own sign-in domain, so no one can claim a domain they don't use. Personal email
domains (gmail.com and others) can never be used. Someone who signs up with that
domain sees the workspace and can ask to join; an Admin approves (the member is
added with the workspace's default role, never Admin) or declines.
"""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    DuplicateResourceError,
    QuotaExceededError,
    ResourceNotFoundError,
    ValidationError,
)
from app.models.account import Account
from app.models.audit_log import AuditLog
from app.models.join_request import JoinRequest
from app.models.tenant import Tenant
from app.models.workspace_member import WorkspaceMember
from app.schemas.join import (
    JoinableWorkspace,
    JoinDomainSetting,
    JoinRequestItem,
)

# Free and personal mailbox providers. Anyone can get an address here, so they
# can never identify an organisation.
PERSONAL_DOMAINS: frozenset[str] = frozenset({
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.fr", "ymail.com", "rocketmail.com",
    "hotmail.com", "hotmail.co.uk", "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com",
    "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net", "mail.com", "zoho.com",
    "zohomail.com", "yandex.com", "yandex.ru", "qq.com", "163.com", "126.com", "hey.com", "fastmail.com",
    "tutanota.com", "tuta.io", "mail.ru", "inbox.com",
})


def domain_of(email: str | None) -> str:
    e = str(email or "").strip().lower()
    return e.rsplit("@", 1)[1] if "@" in e else ""


def is_allowed_domain(domain: str) -> bool:
    return bool(domain) and "." in domain and domain not in PERSONAL_DOMAINS


# ── Admin: the switch ────────────────────────────────────────────────────────

async def _tenant(db: AsyncSession, tenant_id: UUID) -> Tenant:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise ResourceNotFoundError("Workspace not found.")
    return tenant


async def get_setting(db: AsyncSession, tenant_id: UUID, admin_email: str) -> JoinDomainSetting:
    tenant = await _tenant(db, tenant_id)
    mine = domain_of(admin_email)
    return JoinDomainSetting(
        enabled=bool(tenant.join_domain),
        domain=tenant.join_domain or None,  # type: ignore[arg-type]
        your_domain=mine,
        allowed=is_allowed_domain(mine),
    )


async def set_setting(db: AsyncSession, tenant_id: UUID, admin_email: str, enabled: bool) -> JoinDomainSetting:
    tenant = await _tenant(db, tenant_id)
    mine = domain_of(admin_email)
    before = tenant.join_domain
    if enabled:
        if not is_allowed_domain(mine):
            raise ValidationError(
                f"Joining by email domain needs a work email. {mine or 'Your email'} is a personal email "
                "provider, so anyone could sign up with it."
            )
        tenant.join_domain = mine  # type: ignore[assignment]
    else:
        tenant.join_domain = None  # type: ignore[assignment]
    if (before or None) != (tenant.join_domain or None):
        db.add(AuditLog(
            tenant_id=tenant_id, user_email=admin_email, module="Settings",
            action="JOIN_DOMAIN_ON" if enabled else "JOIN_DOMAIN_OFF", record_id=str(tenant_id),
            summary=(f"Let people with @{mine} emails ask to join" if enabled
                     else f"Stopped join requests by email domain (was @{before})"),
        ))
    await db.flush()
    return await get_setting(db, tenant_id, admin_email)


# ── Newcomer: what they can join ─────────────────────────────────────────────

async def joinable_workspaces(db: AsyncSession, account_id: UUID, email: str) -> list[JoinableWorkspace]:
    domain = domain_of(email)
    if not is_allowed_domain(domain):
        return []
    rows = (await db.execute(
        select(Tenant, JoinRequest.status, WorkspaceMember.status)
        .outerjoin(JoinRequest, (JoinRequest.tenant_id == Tenant.id) & (JoinRequest.account_id == account_id))
        .outerjoin(WorkspaceMember,
                   (WorkspaceMember.tenant_id == Tenant.id) & (WorkspaceMember.account_id == account_id))
        .where(func.lower(Tenant.join_domain) == domain)
        .where(Tenant.status == "ACTIVE")
        .order_by(Tenant.name)
    )).all()
    out: list[JoinableWorkspace] = []
    for t, req_status, member_status in rows:
        if member_status is None:
            out.append(JoinableWorkspace(tenant_id=str(t.id), name=str(t.name),
                                         request_status=str(req_status or "NONE")))  # type: ignore[arg-type]
        elif member_status == "ACTIVE" and req_status == "APPROVED":
            # Approved: shown so the newcomer can open it straight from setup.
            out.append(JoinableWorkspace(tenant_id=str(t.id), name=str(t.name), request_status="APPROVED"))
    return out


async def request_to_join(db: AsyncSession, account_id: UUID, email: str, tenant_id: UUID) -> JoinableWorkspace:
    allowed = {w.tenant_id: w for w in await joinable_workspaces(db, account_id, email)}
    ws = allowed.get(str(tenant_id))
    if ws is None:
        raise ResourceNotFoundError("This workspace isn't open to your email domain.")
    if ws.request_status == "DECLINED":
        raise DuplicateResourceError(
            f"Your request to join {ws.name} was declined. Ask an Admin there to invite you."
        )
    if ws.request_status == "APPROVED":
        return ws
    if ws.request_status == "NONE":
        db.add(JoinRequest(tenant_id=tenant_id, account_id=account_id, status="PENDING"))
        db.add(AuditLog(
            tenant_id=tenant_id, user_email=email, module="Users", action="JOIN_REQUEST",
            record_id=str(account_id), summary=f"{email} asked to join",
        ))
        await db.flush()
    return JoinableWorkspace(tenant_id=ws.tenant_id, name=ws.name, request_status="PENDING")


# ── Admin: requests ──────────────────────────────────────────────────────────

async def pending_requests(db: AsyncSession, tenant_id: UUID) -> list[JoinRequestItem]:
    rows = (await db.execute(
        select(JoinRequest, Account)
        .join(Account, Account.id == JoinRequest.account_id)
        .where(JoinRequest.tenant_id == tenant_id, JoinRequest.status == "PENDING")
        .order_by(JoinRequest.created_at)
    )).all()
    return [
        JoinRequestItem(id=str(r.id), email=str(a.email), name=a.name or None,  # type: ignore[arg-type]
                        requested_at=r.created_at)  # type: ignore[arg-type]
        for r, a in rows
    ]


async def _pending(db: AsyncSession, tenant_id: UUID, request_id: UUID) -> tuple[JoinRequest, Account]:
    row = (await db.execute(
        select(JoinRequest, Account)
        .join(Account, Account.id == JoinRequest.account_id)
        .where(JoinRequest.id == request_id, JoinRequest.tenant_id == tenant_id)
        .with_for_update(of=JoinRequest)
    )).first()
    if row is None or row[0].status != "PENDING":
        raise ResourceNotFoundError("This request has already been answered or no longer exists.")
    return row[0], row[1]


async def approve(
    db: AsyncSession, tenant_id: UUID, request_id: UUID, admin_email: str, role: str | None,
) -> None:
    req, account = await _pending(db, tenant_id, request_id)
    tenant = await _tenant(db, tenant_id)
    if not role:
        default = str((tenant.workspace_settings or {}).get("roles_default_role") or "Analyst")
        role = default if default in ("Manager", "Analyst") else "Analyst"  # never Admin by default
    active = await db.scalar(select(func.count()).where(
        WorkspaceMember.tenant_id == tenant_id, WorkspaceMember.status == "ACTIVE",
    ))
    if (active or 0) >= int(tenant.max_users or 0):
        raise QuotaExceededError(f"User limit of {tenant.max_users} reached")
    existing = await db.scalar(select(WorkspaceMember).where(
        WorkspaceMember.account_id == account.id, WorkspaceMember.tenant_id == tenant_id,
    ))
    if existing is not None:
        raise DuplicateResourceError(f"{account.email} is already in this workspace. Reactivate them on the Users page.")
    db.add(WorkspaceMember(
        account_id=account.id, tenant_id=tenant_id, role=role, status="ACTIVE",
        invited_by=admin_email,
    ))
    req.status = "APPROVED"  # type: ignore[assignment]
    req.decided_by = admin_email  # type: ignore[assignment]
    req.decided_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    db.add(AuditLog(
        tenant_id=tenant_id, user_email=admin_email, module="Users", action="JOIN_APPROVE",
        record_id=str(account.id), summary=f"Approved {account.email}'s request to join as {role}",
    ))
    await db.flush()


async def decline(db: AsyncSession, tenant_id: UUID, request_id: UUID, admin_email: str) -> None:
    req, account = await _pending(db, tenant_id, request_id)
    req.status = "DECLINED"  # type: ignore[assignment]
    req.decided_by = admin_email  # type: ignore[assignment]
    req.decided_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    db.add(AuditLog(
        tenant_id=tenant_id, user_email=admin_email, module="Users", action="JOIN_DECLINE",
        record_id=str(account.id), summary=f"Declined {account.email}'s request to join",
    ))
    await db.flush()
