# app/services/incident.py

import re
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundError
from app.models.incident import Incident
from app.models.audit_log import AuditLog
from app.schemas.incident import (
    IncidentCreate,
    IncidentUpdate,
    IncidentResponse,
    IncidentListResponse,
    IncidentStatsResponse,
    IncidentHealth,
    IncidentTotals,
    IncidentLifecycle,
    IncidentResolution,
)
from app.services.recycle import soft_delete


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize(inc: Incident) -> dict:
    return IncidentResponse.model_validate(inc).model_dump(mode='json')


async def _audit(
    db: AsyncSession,
    tenant_id: UUID,
    user_email: str,
    action: str,
    record_id: str,
    summary: str,
) -> None:
    db.add(AuditLog(
        tenant_id=tenant_id,
        user_email=user_email,
        action=action,
        module='Incident',
        record_id=record_id,
        summary=summary,
    ))
    await db.flush()


async def _generate_id(db: AsyncSession, tenant_id: UUID) -> str:
    year = datetime.now(timezone.utc).strftime('%Y')
    prefix = f'INC-{year}-'
    result = await db.execute(
        select(Incident.id)
        .where(Incident.tenant_id == tenant_id)
        .where(Incident.id.like(f'{prefix}%'))
    )
    existing = result.scalars().all()
    max_n = 0
    for inc_id in existing:
        m = re.match(r'^INC-\d{4}-(\d+)$', str(inc_id))
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f'{prefix}{str(max_n + 1).zfill(3)}'


# ── Public API ────────────────────────────────────────────────────────────────

async def list_incidents(
    db: AsyncSession,
    tenant_id: UUID,
    page: int = 1,
    page_size: int = 10,
    incident_id: str | None = None,
    category: str | None = None,
    severity: str | None = None,
    status: str | None = None,
    business_unit: str | None = None,
    search: str | None = None,
) -> IncidentListResponse:
    q = (
        select(Incident)
        .where(Incident.tenant_id == tenant_id)
        .where(Incident.deleted_at.is_(None))
    )

    if incident_id:
        q = q.where(func.upper(Incident.id) == incident_id.strip().upper())
    if category:
        q = q.where(Incident.category == category)
    if severity:
        q = q.where(Incident.severity == severity)
    if status:
        q = q.where(Incident.status == status)
    if business_unit:
        q = q.where(Incident.business_unit == business_unit)
    if search:
        term = f'%{search.lower()}%'
        q = q.where(
            func.lower(Incident.description).like(term)
            | func.lower(Incident.category).like(term)
            | func.lower(Incident.reported_by).like(term)
            | func.lower(Incident.affected_asset).like(term)
            | func.lower(Incident.business_unit).like(term)
        )

    count_result = await db.execute(
        select(func.count()).select_from(q.subquery())
    )
    total = count_result.scalar() or 0

    rows = await db.execute(
        q.order_by(Incident.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    incidents = rows.scalars().all()

    return IncidentListResponse(
        items=[IncidentResponse.model_validate(i) for i in incidents],
        total=total,
        page=page,
        page_size=page_size,
    )


async def create_incident(
    db: AsyncSession,
    tenant_id: UUID,
    payload: IncidentCreate,
    created_by: str,
) -> IncidentResponse:
    inc_id = await _generate_id(db, tenant_id)

    inc = Incident(
        id=inc_id,
        tenant_id=tenant_id,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        severity=payload.severity,
        priority=payload.priority,
        status=payload.status or 'New',
        root_cause=payload.root_cause,
        assigned_to=payload.assigned_to,
        reported_by=payload.reported_by,
        reported_at=payload.reported_at,
        reporter_email=payload.reporter_email,
        channel=payload.channel,
        incident_type=payload.incident_type,
        incident_dt=payload.incident_dt,
        location=payload.location,
        impact_summary=payload.impact_summary,
        affected_asset=payload.affected_asset,
        business_unit=payload.business_unit,
        linked_risk_id=payload.linked_risk_id,
        immediate_actions=payload.immediate_actions,
        evidence_link=payload.evidence_link,
        analyst_notes=payload.analyst_notes,
        containment_date=payload.containment_date,
        tags=payload.tags,
        review_status=payload.review_status,
        risk_impacted=payload.risk_impacted,
        resolution_summary=payload.resolution_summary,
        financial_impact=payload.financial_impact,
        resolved_at=payload.resolved_at,
    )
    db.add(inc)
    await db.flush()
    await db.refresh(inc)

    await _audit(
        db, tenant_id, created_by, 'CREATE', inc_id,
        f'Created incident: {(payload.description or inc_id)[:60]}',
    )

    return IncidentResponse.model_validate(inc)


async def update_incident(
    db: AsyncSession,
    tenant_id: UUID,
    incident_id: str,
    patch: IncidentUpdate,
    updated_by: str,
) -> IncidentResponse:
    result = await db.execute(
        select(Incident)
        .where(Incident.tenant_id == tenant_id)
        .where(Incident.id == incident_id)
        .where(Incident.deleted_at.is_(None))
    )
    inc = result.scalar_one_or_none()
    if not inc:
        raise ResourceNotFoundError(f'Incident {incident_id} not found')

    for field, value in patch.model_dump(exclude_none=True).items():
        setattr(inc, field, value)

    # Auto-set resolved_at when status moves to Resolved or Closed (mirrors GAS closeDate logic)
    if patch.status in ('Resolved', 'Closed') and not inc.resolved_at:
        inc.resolved_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(inc)

    await _audit(
        db, tenant_id, updated_by, 'UPDATE', incident_id,
        f'Updated incident: {incident_id} status: {inc.status}',
    )

    return IncidentResponse.model_validate(inc)


async def delete_incident(
    db: AsyncSession,
    tenant_id: UUID,
    incident_id: str,
    deleted_by: str,
) -> None:
    result = await db.execute(
        select(Incident)
        .where(Incident.tenant_id == tenant_id)
        .where(Incident.id == incident_id)
        .where(Incident.deleted_at.is_(None))
    )
    inc = result.scalar_one_or_none()
    if not inc:
        raise ResourceNotFoundError(f'Incident {incident_id} not found')

    item_data = _serialize(inc)

    await soft_delete(db, tenant_id, 'incident', incident_id, item_data, deleted_by)

    await db.execute(
        delete(Incident)
        .where(Incident.tenant_id == tenant_id)
        .where(Incident.id == incident_id)
    )
    await db.flush()

    await _audit(
        db, tenant_id, deleted_by, 'SOFT_DELETE', incident_id,
        f'Moved to bin: {incident_id}',
    )


async def get_stats(db: AsyncSession, tenant_id: UUID) -> IncidentStatsResponse:
    result = await db.execute(
        select(
            Incident.status,
            Incident.severity,
            Incident.reported_at,
            Incident.resolved_at,
            Incident.financial_impact,
        )
        .where(Incident.tenant_id == tenant_id)
        .where(Incident.deleted_at.is_(None))
    )
    rows = result.all()
    total = len(rows)

    open_statuses = {'New', 'Open', 'In Progress', 'Under Review'}
    critical_severities = {'High', 'Very High'}
    sla_days = 5
    today = date.today()

    open_count = sum(1 for r in rows if r.status in open_statuses)
    critical_count = sum(1 for r in rows if r.severity in critical_severities)
    new_count = sum(1 for r in rows if r.status == 'New')
    review_count = sum(1 for r in rows if r.status == 'Under Review')
    resolved_count = sum(1 for r in rows if r.status in ('Resolved', 'Closed'))

    # SLA breach: open incident older than sla_days
    breaches = sum(
        1 for r in rows
        if r.status in open_statuses
        and r.reported_at
        and (today - r.reported_at).days > sla_days
    )
    sla_breach_pct = round(breaches / total * 100, 1) if total else 0.0

    health_pct = max(0, round(100 - sla_breach_pct))
    health_label = (
        'Healthy' if health_pct >= 75
        else 'At Risk' if health_pct >= 50
        else 'Critical'
    )
    critical_ratio = critical_count / total if total else 0
    critical_trend = 'Stable' if critical_ratio <= 0.2 else 'Increasing'

    # MTTR: resolved/closed incidents with both dates
    mttr_days: list[float] = []
    for r in rows:
        if r.status in ('Resolved', 'Closed') and r.reported_at and r.resolved_at:
            resolved_date = (
                r.resolved_at.date()
                if isinstance(r.resolved_at, datetime)
                else r.resolved_at
            )
            mttr_days.append((resolved_date - r.reported_at).days)

    avg_days = round(sum(mttr_days) / len(mttr_days), 1) if mttr_days else None

    total_impact: Decimal = sum(
        (r.financial_impact for r in rows if r.financial_impact is not None),
        Decimal('0'),
    )

    return IncidentStatsResponse(
        health=IncidentHealth(
            pct=health_pct,
            label=health_label,
            sla_pct=sla_breach_pct,
            critical_trend=critical_trend,
        ),
        totals=IncidentTotals(
            count=total,
            critical_count=critical_count,
            open_count=open_count,
        ),
        lifecycle=IncidentLifecycle(
            new=new_count,
            under_review=review_count,
            resolved=resolved_count,
        ),
        resolution=IncidentResolution(
            avg_days=avg_days,
            total_financial_impact=total_impact,
        ),
    )