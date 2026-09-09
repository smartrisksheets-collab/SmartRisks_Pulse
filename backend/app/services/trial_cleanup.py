"""
Trial workspace cleanup service.
Runs daily. Sends expiry reminders and hard-deletes expired trial workspaces
after the 14-day grace period.

Reminder schedule (days after plan_expires_at):
  Day  1 → Reminder 1: trial expired, 13 days remaining
  Day  7 → Reminder 2: 7 days remaining
  Day 12 → Reminder 3: 2 days remaining
  Day 14 → Hard delete (no email)
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

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
_DELETE_AFTER_DAYS = 30


async def _already_sent(db: AsyncSession, tenant_id: UUID, reminder_num: int) -> bool:
    marker = f"TRIAL_REMINDER_{reminder_num}"
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

    today = date.today()

    expired_tenants = (await db.execute(
        select(Tenant, Account)
        .join(Account, Account.id == Tenant.created_by)
        .where(
            Tenant.plan == "TRIAL",
            Tenant.plan_expires_at.isnot(None),
            Tenant.plan_expires_at < today,
        )
    )).all()

    for tenant, owner in expired_tenants:
        tenant_id  = UUID(str(tenant.id))
        expired_on = tenant.plan_expires_at
        if expired_on is None:
            continue

        days_since = (today - expired_on).days  # type: ignore[operator]

        # Hard delete after grace period
        if days_since >= _DELETE_AFTER_DAYS:
            logger.info(
                "trial_cleanup: deleting expired trial workspace | id=%s | name=%s | days_since=%d",
                tenant_id, tenant.name, days_since,
            )
            await db.execute(delete(Tenant).where(Tenant.id == tenant_id))
            await db.flush()
            continue

        # Send scheduled reminders
        for trigger_day, reminder_num, days_remaining in _REMINDER_DAYS:
            if days_since >= trigger_day:
                if await _already_sent(db, tenant_id, reminder_num):
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
                        summary=f"TRIAL_REMINDER_{reminder_num}: {days_remaining} days remaining",
                    ))
                    await db.flush()
                except Exception:
                    logger.exception(
                        "trial_cleanup: failed to send reminder %d | workspace=%s",
                        reminder_num, tenant_id,
                    )

    await db.commit()