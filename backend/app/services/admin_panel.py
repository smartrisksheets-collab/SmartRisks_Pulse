from datetime import date, datetime, timezone, timedelta
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, and_, or_

from app.core.exceptions import ResourceNotFoundError
from app.core.security import hash_password
from app.core.config import settings
from app.models.admin_account import AdminAccount
from app.models.admin_audit_log import AdminAuditLog
from app.models.api_error_log import ApiErrorLog
from app.models.tenant import Tenant
from app.models.account import Account
from app.models.workspace_member import WorkspaceMember
from app.models.risk import Risk
from app.models.incident import Incident
from app.schemas.admin import (
    AdminAccountCreate,
    AdminAccountOut,
    AdminAccountUpdate,
    AdminAuditLogItem,
    AdminErrorLogItem,
    AdminErrorSummary,
    AdminOverviewStats,
    AdminUserListItem,
    AdminWorkspaceListItem,
    AdminWorkspaceUpdate,
)
from app.core.exceptions import DuplicateResourceError


# ── Overview ──────────────────────────────────────────────────────────────────

async def get_overview_stats(db: AsyncSession) -> AdminOverviewStats:
    today = date.today()
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    trial_cutoff = today - timedelta(days=settings.TRIAL_DURATION_DAYS)
    expiry_window = today + timedelta(days=7)

    row = await db.execute(
        select(
            func.count().label("total"),
            func.count().filter(
                and_(
                    Tenant.plan == "PAID",
                    Tenant.payment_active == True,  # type: ignore[arg-type]
                    Tenant.status == "ACTIVE",
                    or_(
                        Tenant.plan_expires_at.is_(None),
                        Tenant.plan_expires_at >= today,
                    ),
                )
            ).label("active_paid"),
            func.count().filter(
                and_(
                    Tenant.plan == "TRIAL",
                    Tenant.trial_start_date >= trial_cutoff,
                    Tenant.status == "ACTIVE",
                )
            ).label("on_trial"),
            func.count().filter(
                or_(
                    and_(
                        Tenant.plan == "TRIAL",
                        Tenant.trial_start_date < trial_cutoff,
                    ),
                    and_(
                        Tenant.plan == "PAID",
                        Tenant.plan_expires_at < today,
                    ),
                )
            ).label("expired"),
            func.count().filter(
                Tenant.status == "SUSPENDED"
            ).label("suspended"),
            func.count().filter(
                Tenant.created_at >= week_ago
            ).label("new_this_week"),
            func.count().filter(
                and_(
                    Tenant.plan == "TRIAL",
                    Tenant.status == "ACTIVE",
                    func.date(
                        Tenant.trial_start_date + text(f"interval '{settings.TRIAL_DURATION_DAYS} days'")
                    ).between(today, expiry_window),
                )
            ).label("trials_expiring_7d"),
            func.count().filter(
                Tenant.plan == "PAID"
            ).label("paid_count"),
        ).select_from(Tenant)
    )
    s = row.one()

    activated = await db.scalar(
        select(func.count(func.distinct(Risk.tenant_id))).select_from(Risk)
    ) or 0

    total = int(s.total)
    conversion_rate = round((int(s.paid_count) / total * 100), 1) if total else 0.0
    activation_rate = round((activated / total * 100), 1) if total else 0.0

    return AdminOverviewStats(
        total_workspaces=total,
        active_paid=int(s.active_paid),
        on_trial=int(s.on_trial),
        expired=int(s.expired),
        suspended=int(s.suspended),
        new_this_week=int(s.new_this_week),
        trials_expiring_7d=int(s.trials_expiring_7d),
        trial_conversion_rate=conversion_rate,
        activation_rate=activation_rate,
    )


# ── Workspaces ────────────────────────────────────────────────────────────────

async def list_workspaces(db: AsyncSession) -> list[AdminWorkspaceListItem]:
    today = date.today()
    trial_cutoff = today - timedelta(days=settings.TRIAL_DURATION_DAYS)

    rows = await db.execute(
        select(
            Tenant.id,
            Tenant.name,
            Tenant.industry,
            Tenant.plan,
            Tenant.status,
            Tenant.payment_active,
            Tenant.payment_date,
            Tenant.plan_expires_at,
            Tenant.modules,
            Tenant.max_users,
            Tenant.max_risks,
            Tenant.trial_start_date,
            Tenant.created_at,
            func.count(func.distinct(WorkspaceMember.id)).label("member_count"),
            func.count(func.distinct(Risk.id)).label("risk_count"),
            func.count(func.distinct(Incident.id)).label("incident_count"),
            func.min(Risk.created_at).label("first_risk_at"),
        )
        .outerjoin(WorkspaceMember, WorkspaceMember.tenant_id == Tenant.id)
        .outerjoin(Risk, Risk.tenant_id == Tenant.id)
        .outerjoin(Incident, Incident.tenant_id == Tenant.id)
        .group_by(Tenant.id)
        .order_by(Tenant.created_at.desc())
    )

    items: list[AdminWorkspaceListItem] = []
    for r in rows:
        if str(r.status) == "SUSPENDED":
            derived_status = "SUSPENDED"
        elif str(r.plan) == "PAID":
            expires = r.plan_expires_at
            derived_status = "ACTIVE" if (expires is None or expires >= today) else "EXPIRED"
        else:
            trial_start = r.trial_start_date
            derived_status = "TRIAL" if (trial_start is not None and trial_start >= trial_cutoff) else "EXPIRED"

        items.append(AdminWorkspaceListItem(
            id=str(r.id),
            name=str(r.name),
            industry=str(r.industry) if r.industry else None,
            plan=str(r.plan),
            status=derived_status,
            payment_active=bool(r.payment_active),
            payment_date=r.payment_date,
            plan_expires_at=r.plan_expires_at,
            modules=list(r.modules or []),
            max_users=int(r.max_users),
            max_risks=int(r.max_risks),
            member_count=int(r.member_count),
            risk_count=int(r.risk_count),
            incident_count=int(r.incident_count),
            first_risk_at=r.first_risk_at,
            created_at=r.created_at,
        ))

    return items


async def update_workspace(
    tenant_id: str,
    payload: AdminWorkspaceUpdate,
    admin_id: str,
    db: AsyncSession,
) -> None:
    result = await db.execute(
        select(Tenant).where(Tenant.id == UUID(tenant_id))
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise ResourceNotFoundError("Workspace not found.")

    before: dict = {}
    after: dict = {}

    fields = {
        "plan": payload.plan,
        "payment_active": payload.payment_active,
        "payment_date": payload.payment_date,
        "plan_expires_at": payload.plan_expires_at,
        "max_users": payload.max_users,
        "max_risks": payload.max_risks,
        "modules": payload.modules,
        "industry": payload.industry,
        "status": payload.workspace_status,
    }

    for field, value in fields.items():
        if value is None:
            continue
        current = getattr(tenant, field)
        before[field] = str(current) if current is not None else None
        setattr(tenant, field, value)
        after[field] = str(value)

    await db.flush()

    from app.services.admin_auth import write_audit_log
    await write_audit_log(
        admin_id=admin_id,
        action="update_workspace",
        target_type="workspace",
        target_id=tenant_id,
        db=db,
        meta={"before": before, "after": after},
    )


# ── User intelligence ─────────────────────────────────────────────────────────

async def list_platform_users(db: AsyncSession) -> list[AdminUserListItem]:
    rows = await db.execute(
        select(
            Account.id,
            Account.email,
            Account.name,
            Account.last_login,
            Account.last_seen,
            Account.created_at,
            func.count(func.distinct(WorkspaceMember.tenant_id)).label("workspace_count"),
            func.count(func.distinct(Risk.id)).label("total_risks"),
        )
        .outerjoin(WorkspaceMember, WorkspaceMember.account_id == Account.id)
        .outerjoin(Risk, Risk.tenant_id == WorkspaceMember.tenant_id)
        .group_by(Account.id)
        .order_by(Account.created_at.desc())
    )

    return [
        AdminUserListItem(
            id=str(r.id),
            email=str(r.email),
            name=str(r.name),
            last_login=r.last_login,
            last_seen=r.last_seen,
            workspace_count=int(r.workspace_count),
            created_at=r.created_at,
            is_ghost=int(r.total_risks) == 0,
        )
        for r in rows
    ]


# ── Admin account management ──────────────────────────────────────────────────

async def list_admin_accounts(db: AsyncSession) -> list[AdminAccountOut]:
    result = await db.execute(
        select(AdminAccount).order_by(AdminAccount.created_at)
    )
    return [
        AdminAccountOut(
            id=str(a.id),
            email=str(a.email),
            name=str(a.name),
            role=str(a.role),
            status=str(a.status),
            last_login=a.last_login,
            created_at=a.created_at,  # type: ignore[arg-type]
        )
        for a in result.scalars()
    ]


async def create_admin_account(
    payload: AdminAccountCreate,
    creator_id: str,
    db: AsyncSession,
) -> AdminAccountOut:
    existing = await db.execute(
        select(AdminAccount).where(AdminAccount.email == payload.email.lower())
    )
    if existing.scalar_one_or_none():
        raise DuplicateResourceError("An admin account with this email already exists.")

    admin = AdminAccount(
        email=payload.email.lower(),
        name=payload.name,
        password_hash=hash_password(payload.password),
        role=payload.role,
        status="ACTIVE",
        created_by=UUID(creator_id),
    )
    db.add(admin)
    await db.flush()

    from app.services.admin_auth import write_audit_log
    await write_audit_log(
        admin_id=creator_id,
        action="create_admin_account",
        target_type="admin_account",
        target_id=str(admin.id),
        db=db,
        meta={"email": payload.email, "role": payload.role},
    )

    return AdminAccountOut(
        id=str(admin.id),
        email=str(admin.email),
        name=str(admin.name),
        role=str(admin.role),
        status=str(admin.status),
        last_login=None,
        created_at=admin.created_at,  # type: ignore[arg-type]
    )


async def update_admin_account(
    target_id: str,
    payload: AdminAccountUpdate,
    actor_id: str,
    db: AsyncSession,
) -> AdminAccountOut:
    result = await db.execute(
        select(AdminAccount).where(AdminAccount.id == UUID(target_id))
    )
    admin = result.scalar_one_or_none()
    if not admin:
        raise ResourceNotFoundError("Admin account not found.")

    before: dict = {}
    after: dict = {}

    for field, value in {"name": payload.name, "role": payload.role, "status": payload.status}.items():
        if value is None:
            continue
        before[field] = str(getattr(admin, field))
        setattr(admin, field, value)
        after[field] = value

    await db.flush()

    from app.services.admin_auth import write_audit_log
    await write_audit_log(
        admin_id=actor_id,
        action="update_admin_account",
        target_type="admin_account",
        target_id=target_id,
        db=db,
        meta={"before": before, "after": after},
    )

    return AdminAccountOut(
        id=str(admin.id),
        email=str(admin.email),
        name=str(admin.name),
        role=str(admin.role),
        status=str(admin.status),
        last_login=admin.last_login,
        created_at=admin.created_at,  # type: ignore[arg-type]
    )


# ── API error log ─────────────────────────────────────────────────────────────

async def list_errors(
    db: AsyncSession,
    status_code: int | None = None,
    limit: int = 100,
) -> list[AdminErrorLogItem]:
    q = select(ApiErrorLog).order_by(ApiErrorLog.created_at.desc()).limit(limit)
    if status_code:
        q = q.where(ApiErrorLog.status_code == status_code)

    result = await db.execute(q)
    return [
        AdminErrorLogItem(
            id=str(e.id),
            tenant_id=str(e.tenant_id) if e.tenant_id else None,
            method=str(e.method),
            path=str(e.path),
            status_code=int(e.status_code),  # type: ignore[arg-type]
            error_detail=str(e.error_detail) if e.error_detail else None,
            request_body=dict(e.request_body) if e.request_body else None,  # type: ignore[arg-type]
            duration_ms=int(e.duration_ms) if e.duration_ms else None,  # type: ignore[arg-type]
            created_at=e.created_at,  # type: ignore[arg-type]
        )
        for e in result.scalars()
    ]


async def get_error_summary(db: AsyncSession) -> AdminErrorSummary:
    since = datetime.now(timezone.utc) - timedelta(hours=24)

    total = await db.scalar(
        select(func.count()).select_from(ApiErrorLog).where(ApiErrorLog.created_at >= since)
    ) or 0
    errors_5xx = await db.scalar(
        select(func.count()).select_from(ApiErrorLog).where(
            and_(ApiErrorLog.status_code >= 500, ApiErrorLog.created_at >= since)
        )
    ) or 0
    errors_4xx = await db.scalar(
        select(func.count()).select_from(ApiErrorLog).where(
            and_(ApiErrorLog.status_code >= 400, ApiErrorLog.status_code < 500, ApiErrorLog.created_at >= since)
        )
    ) or 0

    top_paths_rows = await db.execute(
        select(ApiErrorLog.path, func.count().label("count"))
        .where(ApiErrorLog.created_at >= since)
        .group_by(ApiErrorLog.path)
        .order_by(text("count DESC"))
        .limit(10)
    )
    top_paths = [{"path": r.path, "count": r.count} for r in top_paths_rows]

    hourly_rows = await db.execute(
        select(
            func.date_trunc("hour", ApiErrorLog.created_at).label("hour"),
            func.count().label("count"),
        )
        .where(ApiErrorLog.created_at >= since)
        .group_by(text("hour"))
        .order_by(text("hour"))
    )
    errors_by_hour = [
        {"hour": r.hour.isoformat(), "count": r.count}
        for r in hourly_rows
    ]

    return AdminErrorSummary(
        total_errors=total,
        errors_5xx=errors_5xx,
        errors_4xx=errors_4xx,
        top_paths=top_paths,
        errors_by_hour=errors_by_hour,
    )

# ── Admin audit log ───────────────────────────────────────────────────────────

async def list_admin_audit_log(
    db: AsyncSession,
    limit: int = 100,
) -> list[AdminAuditLogItem]:
    rows = await db.execute(
        select(
            AdminAuditLog.id,
            AdminAuditLog.admin_id,
            AdminAuditLog.action,
            AdminAuditLog.target_type,
            AdminAuditLog.target_id,
            AdminAuditLog.meta,
            AdminAuditLog.created_at,
            AdminAccount.name.label("admin_name"),
        )
        .outerjoin(AdminAccount, AdminAccount.id == AdminAuditLog.admin_id)
        .order_by(AdminAuditLog.created_at.desc())
        .limit(limit)
    )

    return [
        AdminAuditLogItem(
            id=str(r.id),
            admin_id=str(r.admin_id) if r.admin_id else None,
            admin_name=str(r.admin_name) if r.admin_name else None,
            action=str(r.action),
            target_type=str(r.target_type),
            target_id=str(r.target_id),
            meta=dict(r.meta) if r.meta else None,  # type: ignore[arg-type]
            created_at=r.created_at,  # type: ignore[arg-type]
        )
        for r in rows
    ]