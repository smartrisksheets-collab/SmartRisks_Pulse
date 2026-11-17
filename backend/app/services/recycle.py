# app/services/recycle.py

from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.recycle_bin import RecycleBin
from app.models.audit_log import AuditLog
from app.core.config import settings
from app.core.exceptions import PermissionDeniedError, ResourceNotFoundError, ValidationError
from app.services.evidence import delete_evidence_objects


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


# The permission that owns each kind of record in the bin. Restoring or purging
# a record needs the same permission as deleting it.
_BIN_PERMISSION: dict[str, str] = {'risk': 'manage_risks', 'incident': 'manage_incidents'}


def _check_bin_permission(item_type: str, permissions: dict[str, Any]) -> None:
    perm = _BIN_PERMISSION.get(item_type)
    if perm is None or not permissions.get(perm):
        raise PermissionDeniedError(f"Permission denied: {perm or 'manage_risks'} required")


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
    *,
    permissions: dict[str, Any],
) -> dict:
    result = await db.execute(
        select(RecycleBin)
        .where(RecycleBin.id == bin_id)
        .where(RecycleBin.tenant_id == tenant_id)
    )
    bin_item = result.scalar_one_or_none()
    if not bin_item:
        raise ResourceNotFoundError(f'Bin item {bin_id} not found')
    _check_bin_permission(str(bin_item.item_type), permissions)

    data = bin_item.item_data

    if bin_item.item_type == 'risk':
        from app.models.risk import Risk
        from app.services.matrix_config import _get_or_create as _get_matrix
        from app.services.risk import _score
        cfg = await _get_matrix(db, tenant_id, lock_share=True)
        try:
            scored = _score(
                data.get('likelihood'), data.get('impact_score'),
                data.get('control_effectiveness'), cfg,
            )
        except ValueError:
            raise ValidationError(
                f"Risk {data['id']} is rated {data.get('control_effectiveness')} for control "
                f"effectiveness, above this workspace's {int(cfg.ce_scale)}-level scale. "  # type: ignore[arg-type]
                'It cannot be restored on the current scale.'
            ) from None
        restored = Risk(
            id=data['id'],
            tenant_id=tenant_id,
            category=data.get('category'),
            title=data.get('title'),
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
            control_assertion_source=data.get('control_assertion_source'),
            root_cause=data.get('root_cause'),
            financial_exposure=data.get('financial_exposure'),
            linked_decision=data.get('linked_decision'),
            linked_decision_at=_to_date(data.get('linked_decision_at')),
            source=data.get('source') or 'internal',
            source_submission_id=UUID(data['source_submission_id']) if data.get('source_submission_id') else None,
        )
        # Evidence document (migration 066): the file stays in storage while the
        # risk is in the bin, so restoring the columns reattaches it.
        if data.get('evidence_path') and data.get('evidence_name'):
            restored.evidence_path        = data['evidence_path']
            restored.evidence_name        = data['evidence_name']
            restored.evidence_mime        = data.get('evidence_mime')
            restored.evidence_size        = data.get('evidence_size')
            restored.evidence_uploaded_at = _to_dt(data.get('evidence_uploaded_at'))
            restored.evidence_uploaded_by = data.get('evidence_uploaded_by')
        restored.severity       = scored['severity']
        restored.level          = scored['level']
        restored.level_index    = scored['level_index']
        restored.is_elevated    = scored['is_elevated']  # type: ignore[assignment]
        restored.residual       = scored['residual']
        restored.overall_rating = scored['overall_rating']
        db.add(restored)

    elif bin_item.item_type == 'incident':
        from app.models.incident import Incident
        from app.services.incident_status import normalise_status
        # Every stored field comes back (linkage, owner, dates, cost and so on),
        # not only the original subset. Statuses from before migration 064 are renamed.
        text_fields = (
            'title', 'description', 'category', 'severity', 'priority', 'root_cause',
            'assigned_to', 'reported_by', 'reporter_email', 'channel', 'incident_type',
            'location', 'impact_summary', 'affected_asset', 'business_unit', 'linked_risk_id',
            'linked_control', 'control_outcome', 'impact_confidence', 'immediate_actions',
            'evidence_link', 'analyst_notes', 'tags', 'review_status', 'risk_impacted',
            'resolution_summary', 'ai_impact', 'ai_actions', 'ai_status',
        )
        restored = Incident(
            id=data['id'],
            tenant_id=tenant_id,
            status=normalise_status(data.get('status')),
            reported_at=_to_date(data.get('reported_at')),
            containment_date=_to_date(data.get('containment_date')),
            incident_dt=_to_dt(data.get('incident_dt')),
            resolved_at=_to_dt(data.get('resolved_at')),
            ai_last_generated=_to_dt(data.get('ai_last_generated')),
            financial_impact=_to_decimal(data.get('financial_impact')),
            **{f: data.get(f) for f in text_fields},
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


def _bin_evidence_path(item_type: str, item_data: dict | None) -> str | None:
    """The evidence object path stored with a binned risk, if it had a document."""
    if item_type != 'risk' or not item_data:
        return None
    path = item_data.get('evidence_path')
    return str(path) if path else None


async def permanent_delete(
    db: AsyncSession,
    tenant_id: UUID,
    bin_id: UUID,
    deleted_by: str = "",
    *,
    permissions: dict[str, Any],
) -> None:
    result = await db.execute(
        select(RecycleBin)
        .where(RecycleBin.id == bin_id)
        .where(RecycleBin.tenant_id == tenant_id)
    )
    bin_item = result.scalar_one_or_none()
    if not bin_item:
        raise ResourceNotFoundError(f'Bin item {bin_id} not found')
    _check_bin_permission(str(bin_item.item_type), permissions)
    item_type  = str(bin_item.item_type or "item").capitalize()
    item_id    = str(bin_item.item_id   or "")
    await db.execute(delete(RecycleBin).where(RecycleBin.id == bin_id))
    evidence_path = _bin_evidence_path(str(bin_item.item_type or ""), bin_item.item_data)  # type: ignore[arg-type]
    db.add(AuditLog(
        tenant_id=tenant_id,
        user_email=deleted_by,
        action="PERMANENT_DELETE",
        module=item_type,
        record_id=item_id,
        summary=f"Permanently deleted {item_type.lower()} {item_id} from bin",
    ))
    await db.flush()
    if evidence_path:
        await delete_evidence_objects([evidence_path])


async def purge_expired(db: AsyncSession) -> int:
    """Entry point for the daily scheduler job."""
    now = datetime.now(timezone.utc)
    # Evidence files of risks about to be purged, read before the rows go.
    expiring = await db.execute(
        select(RecycleBin.item_type, RecycleBin.item_data)
        .where(RecycleBin.purge_at < now, RecycleBin.item_type == 'risk')
    )
    paths = [p for p in (_bin_evidence_path(str(t), d) for t, d in expiring.all()) if p]
    result = await db.execute(
        delete(RecycleBin).where(RecycleBin.purge_at < now)
    )
    await db.flush()
    if paths:
        await delete_evidence_objects(paths)
    return result.rowcount