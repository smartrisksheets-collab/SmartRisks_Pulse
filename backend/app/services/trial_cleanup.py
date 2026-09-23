"""
Trial workspace expiry reminders.
Runs daily. Sends reminders to owners of expired TRIAL workspaces during a
30-day grace period. Never deletes. After the grace period the workspace is
logged as eligible for manual deletion from the admin panel.

Grace clock starts at max(trial_ends_at, TRIAL_CLEANUP_START_DATE).
Reminder schedule (days into grace):
  Day  1 → Reminder 1
  Day 14 → Reminder 2
  Day 25 → Reminder 3
  Day 29 → Reminder 4
  Day 30 → Logged as eligible for manual deletion
"""

from __future__ import annotations

import logging
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

from app.models.tenant import Tenant
from app.models.account import Account
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

# (days_since_expiry, reminder_number, days_remaining_message)
_REMINDER_DAYS: list[tuple[int, int, int]] = [
    (1,  1, 29),
    (14, 2, 16),
    (25, 3,  5),
    (29, 4,  1),
]
_GRACE_DAYS = 30


def _marker(reminder_num: int, trial_end: date) -> str:
    return f"TRIAL_REMINDER_{reminder_num}|{trial_end.isoformat()}"


async def _already_sent(db: AsyncSession, tenant_id: UUID, marker: str) -> bool:
    row = await db.scalar(
        select(AuditLog).where(
            AuditLog.tenant_id == tenant_id,
            AuditLog.action == "TRIAL_EXPIRY_REMINDER",
            AuditLog.summary.contains(marker),  # type: ignore[union-attr]
        )
    )
    return row is not None


async def run_trial_cleanup(db: AsyncSession) -> None:
    from app.services.email import send_trial_expiry_reminder

    start_floor = settings.TRIAL_CLEANUP_START_DATE
    if start_floor is None:
        logger.warning("trial_cleanup: skipped, TRIAL_CLEANUP_START_DATE is not set")
        return
    dry_run = settings.TRIAL_CLEANUP_DRY_RUN
    today = date.today()

    expired_tenants = (await db.execute(
        select(Tenant, Account)
        .join(Account, Account.id == Tenant.created_by)
        .where(
            Tenant.plan == "TRIAL",
            Tenant.status == "ACTIVE",
            Tenant.trial_ends_at < today,
        )
    )).all()

    for tenant, owner in expired_tenants:
        tenant_id = UUID(str(tenant.id))
        trial_end: date | None = tenant.trial_ends_at  # type: ignore[assignment]
        if trial_end is None:
            continue

        clock_start = max(trial_end, start_floor)
        days_since = (today - clock_start).days

        if days_since >= _GRACE_DAYS:
            logger.info(
                "trial_cleanup: grace ended, eligible for manual deletion | id=%s | name=%s | trial_ended=%s",
                tenant_id, tenant.name, trial_end.isoformat(),
            )
            continue

        due = [item for item in _REMINDER_DAYS if days_since >= item[0]]
        if not due:
            continue
        _, reminder_num, days_remaining = due[-1]

        marker = _marker(reminder_num, trial_end)
        if await _already_sent(db, tenant_id, marker):
            continue

        if dry_run:
            logger.info(
                "trial_cleanup[dry-run]: would send reminder %d | id=%s | name=%s | to=%s | days_remaining=%d",
                reminder_num, tenant_id, tenant.name, owner.email, days_remaining,
            )
            continue

        try:
            send_trial_expiry_reminder(
                to=str(owner.email),
                workspace_name=str(tenant.name or "your workspace"),
                days_remaining=days_remaining,
                reminder_num=reminder_num,
            )
            db.add(AuditLog(
                tenant_id=tenant_id,
                user_email="system@smartriskpulse.internal",
                action="TRIAL_EXPIRY_REMINDER",
                module="System",
                record_id=str(tenant_id),
                summary=f"{marker}: {days_remaining} days remaining",
            ))
            await db.flush()
        except Exception:
            logger.exception(
                "trial_cleanup: failed to send reminder %d | workspace=%s",
                reminder_num, tenant_id,
            )

    await db.commit()