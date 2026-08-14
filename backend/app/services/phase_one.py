# app/services/phase_one.py

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_feed import ActivityFeed
from app.models.risk_history import RiskHistory
from app.core.config import settings

_MOVE_THRESHOLD = 0.5
_FRESH_DAYS     = 15
_AGING_DAYS     = 30


def compute_movement(delta: float) -> str:
    if delta > _MOVE_THRESHOLD:
        return 'Increasing'
    if delta < -_MOVE_THRESHOLD:
        return 'Improving'
    return 'Stable'


def compute_freshness(last_reviewed_at: datetime | None, logged_at: date | None = None) -> str:
    ref: datetime | None = last_reviewed_at
    if ref is None and logged_at is not None:
        ref = datetime(logged_at.year, logged_at.month, logged_at.day, tzinfo=timezone.utc)
    if ref is None:
        return 'Fresh'
    days = (datetime.now(timezone.utc) - ref).days
    if days < _FRESH_DAYS:
        return 'Fresh'
    if days < _AGING_DAYS:
        return 'Aging'
    return 'Stale'


async def log_risk_history(
    db: AsyncSession,
    tenant_id: UUID,
    risk_id: str,
    residual_score: float,
    changed_by: str,
) -> None:
    db.add(RiskHistory(
        tenant_id=tenant_id,
        risk_id=risk_id,
        residual_score=Decimal(str(round(residual_score, 4))),
        changed_by=changed_by,
    ))
    await db.flush()


async def log_activity(
    db: AsyncSession,
    tenant_id: UUID,
    risk_id: str,
    risk_title: str,
    action_type: str,
    old_value: float | None,
    new_value: float | None,
    user_email: str,
    category: str | None = None,
    level: str | None = None,
) -> None:
    db.add(ActivityFeed(
        tenant_id=tenant_id,
        risk_id=risk_id,
        risk_title=risk_title,
        action_type=action_type,
        old_value=Decimal(str(old_value)) if old_value is not None else None,
        new_value=Decimal(str(new_value)) if new_value is not None else None,
        user_email=user_email,
        category=category,
        level=level,
    ))
    await db.flush()

    # Enforce cap: delete oldest rows beyond limit
    count_result = await db.execute(
        select(func.count())
        .select_from(ActivityFeed)
        .where(ActivityFeed.tenant_id == tenant_id)
    )
    count = count_result.scalar() or 0
    overflow = count - settings.ACTIVITY_FEED_CAP

    if overflow > 0:
        oldest = await db.execute(
            select(ActivityFeed.id)
            .where(ActivityFeed.tenant_id == tenant_id)
            .order_by(ActivityFeed.created_at.asc())
            .limit(overflow)
        )
        oldest_ids = oldest.scalars().all()
        if oldest_ids:
            await db.execute(
                delete(ActivityFeed).where(ActivityFeed.id.in_(oldest_ids))
            )
            await db.flush()