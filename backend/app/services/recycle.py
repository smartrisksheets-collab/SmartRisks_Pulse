# app/services/recycle.py

from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recycle_bin import RecycleBin
from app.models.audit_log import AuditLog
from app.core.config import settings
from app.core.exceptions import ResourceNotFoundError


def _to_date(v: str | date | None) -> date | None:
    if v is None:
        return None
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v)[:10])


def _to_dt(v: str | datetime | None) -> datetime | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v
    return datetime.fromisoformat(str(v))


def _to_decimal(v: float | int | str | None) -> Decimal | None:
    if v is None:
        return None
    return Decimal(str(v))


async def soft_delete(
    db: AsyncSession,
    tenant_id: UUID,
    item_type: str,
    item_id: str,
    item_data: dict,
    deleted_by: str,
) -> None:
    now = datetime.now(timezone.utc)
    db.add(RecycleBin(
        tenant_id=tenant_id,
        item_type=item_type,
        item_id=item_id,
        item_data=item_data,
        deleted_by=deleted_by,
        purge_at=now + timedelta(days=settings.RECYCLE_BIN_TTL_DAYS),
    ))
    await db.flush()


async def list_bin(
    db: AsyncSession,
    tenant_id: UUID,
    item_type: str | None = None,
) -> list[dict]:
    q = (
        select(RecycleBin)
        .where(RecycleBin.tenant_id == tenant_id)
        .order_by(RecycleBin.created_at.desc())
    )
    if item_type:
        q = q.where(RecycleBin.item_type == item_type)

    result = await db.execute(q)
    items = result.scalars().all()
    now = datetime.now(timezone.utc)

    return [
        {
            'bin_id': str(item.id),
            'item_type': item.item_type,
            'item_id': item.item_id,
            'summary': (
                item.item_data.get('description')
                or item.item_data.get('title')
                or item.item_id
            ),
            'deleted_by': item.deleted_by,
            'deleted_at': item.created_at.isoformat(),
            'days_left': max(0, (item.purge_at - now).days),
        }
        for item in items
    ]


async def get_bin_count(db: AsyncSession, tenant_id: UUID) -> int:
    from sqlalchemy import func
    result = await db.execute(
        select(func.count())
        .select_from(RecycleBin)
        .where(RecycleBin.tenant_id == tenant_id)
    )
    return result.scalar() or 0


async def restore_item(
    db: AsyncSession,
    tenant_id: UUID,
    bin_id: UUID,
    restored_by: str,
) -> dict:
    result = await db.execute(
        select(RecycleBin)
        .where(RecycleBin.id == bin_id)
        .where(RecycleBin.tenant_id == tenant_id)
    )
    bin_item = result.scalar_one_or_none()
    if not bin_item:
        raise ResourceNotFoundError(f'Bin item {bin_id} not found')

    data = bin_item.item_data

    if bin_item.item_type == 'risk':
        from app.models.risk import Risk
        restored = Risk(
            id=data['id'],
            tenant_id=tenant_id,
            category=data.get('category'),
            description=data.get('description'),
            primary_impact=data.get('primary_impact'),
            owner=data.get('owner'),
            owner_email=data.get('owner_email'),
            logged_at=_to_date(data.get('logged_at')),
            likelihood=data.get('likelihood'),
            impact_score=data.get('impact_score'),
            severity=_to_decimal(data.get('severity')),
            level=data.get('level'),
            treatment=data.get('treatment'),
            controls=data.get('controls'),
            control_effectiveness=data.get('control_effectiveness'),
            residual=_to_decimal(data.get('residual')),
            overall_rating=_to_decimal(data.get('overall_rating')),
            mitigation_plan=data.get('mitigation_plan'),
            comments=data.get('comments'),
            ai_insight=data.get('ai_insight'),
            score_delta=_to_decimal(data.get('score_delta')) or Decimal('0'),
            movement=data.get('movement'),
            freshness=data.get('freshness'),
            target_date=_to_date(data.get('target_date')),
            mitigation_status=data.get('mitigation_status', 'Open'),
            last_reviewed_at=_to_dt(data.get('last_reviewed_at')),
            control_last_tested=_to_date(data.get('control_last_tested')),
            control_test_result=data.get('control_test_result', 'Not Tested'),
        )
        db.add(restored)

    elif bin_item.item_type == 'incident':
        from app.models.incident import Incident
        restored = Incident(
            id=data['id'],
            tenant_id=tenant_id,
            title=data.get('title'),
            description=data.get('description'),
            category=data.get('category'),
            severity=data.get('severity'),
            priority=data.get('priority'),
            status=data.get('status', 'Open'),
            root_cause=data.get('root_cause'),
            assigned_to=data.get('assigned_to'),
            reported_by=data.get('reported_by'),
            reported_at=_to_date(data.get('reported_at')),
            resolved_at=_to_dt(data.get('resolved_at')),
            financial_impact=_to_decimal(data.get('financial_impact')),
            ai_impact=data.get('ai_impact'),
            ai_actions=data.get('ai_actions'),
        )
        db.add(restored)

    else:
        raise ResourceNotFoundError(f'Unknown item type: {bin_item.item_type}')

    await db.execute(delete(RecycleBin).where(RecycleBin.id == bin_id))

    db.add(AuditLog(
        tenant_id=tenant_id,
        user_email=restored_by,
        action='RESTORE',
        module=bin_item.item_type.capitalize(),
        record_id=bin_item.item_id,
        summary=f'Restored from bin: {bin_item.item_id}',
    ))
    await db.flush()
    return {'item_type': bin_item.item_type, 'item_id': bin_item.item_id}


async def permanent_delete(
    db: AsyncSession,
    tenant_id: UUID,
    bin_id: UUID,
    deleted_by: str = "",
) -> None:
    result = await db.execute(
        select(RecycleBin)
        .where(RecycleBin.id == bin_id)
        .where(RecycleBin.tenant_id == tenant_id)
    )
    bin_item = result.scalar_one_or_none()
    if not bin_item:
        raise ResourceNotFoundError(f'Bin item {bin_id} not found')
    item_type  = str(bin_item.item_type or "item").capitalize()
    item_id    = str(bin_item.item_id   or "")
    await db.execute(delete(RecycleBin).where(RecycleBin.id == bin_id))
    db.add(AuditLog(
        tenant_id=tenant_id,
        user_email=deleted_by,
        action="PERMANENT_DELETE",
        module=item_type,
        record_id=item_id,
        summary=f"Permanently deleted {item_type.lower()} {item_id} from bin",
    ))
    await db.flush()


async def purge_expired(db: AsyncSession) -> int:
    """Entry point for the daily scheduler job."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        delete(RecycleBin).where(RecycleBin.purge_at < now)
    )
    await db.flush()
    return result.rowcount