# app/services/incident.py

import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
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
    HealthComponent,
)
from app.services.recycle import soft_delete
from app.services.incident_severity import compute_breach, get_sla_map


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
        linked_control=payload.linked_control,
        control_outcome=payload.control_outcome,
        impact_confidence=payload.impact_confidence,
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


async def get_stats(db: AsyncSession, tenant_id: UUID) -> IncidentStatsResponse:  # noqa: C901
    result = await db.execute(
        select(
            Incident.id,
            Incident.status,
            Incident.severity,
            Incident.category,
            Incident.business_unit,
            Incident.reported_at,
            Incident.resolved_at,
            Incident.financial_impact,
            Incident.linked_risk_id,
            Incident.created_at,
        )
        .where(Incident.tenant_id == tenant_id)
        .where(Incident.deleted_at.is_(None))
    )
    rows = result.all()
    total = len(rows)

    OPEN_STATES     = {'New', 'Open', 'In Progress', 'Under Review'}
    TERMINAL_STATES = {'Resolved', 'Closed'}
    SEV_WEIGHT      = {'Very High': 8, 'High': 5, 'Medium': 2, 'Low': 1}
    today   = date.today()
    now_utc = datetime.now(timezone.utc)

    sla_map = await get_sla_map(db, tenant_id)
    _DEF_H  = {'Very High': 24.0, 'High': 72.0, 'Medium': 120.0, 'Low': 240.0}
    eff_h   = sla_map if sla_map else _DEF_H
    sla_d   = {sev: max(1, round(h / 24)) for sev, h in eff_h.items()}

    def _age_h(r) -> float:  # type: ignore[no-untyped-def]
        if r.reported_at is None:
            return 0.0
        ref = datetime(r.reported_at.year, r.reported_at.month, r.reported_at.day, tzinfo=timezone.utc)
        return (now_utc - ref).total_seconds() / 3600

    def _age_d(r) -> int:  # type: ignore[no-untyped-def]
        return (today - r.reported_at).days if r.reported_at else 0

    def _tgt_h(r) -> float:  # type: ignore[no-untyped-def]
        return eff_h.get(str(r.severity or ''), 120.0)

    def _tgt_d(r) -> int:  # type: ignore[no-untyped-def]
        return sla_d.get(str(r.severity or ''), 5)

    def _is_open(r) -> bool:  # type: ignore[no-untyped-def]
        return str(r.status or '') in OPEN_STATES

    def _is_term(r) -> bool:  # type: ignore[no-untyped-def]
        return str(r.status or '') in TERMINAL_STATES

    def _breached(r) -> bool:  # type: ignore[no-untyped-def]
        if _is_open(r):
            return compute_breach(_age_h(r), _tgt_h(r))
        if _is_term(r) and r.reported_at and r.resolved_at:
            rd = r.resolved_at.date() if isinstance(r.resolved_at, datetime) else r.resolved_at
            return (rd - r.reported_at).days * 24 > _tgt_h(r)
        return False

    # ── Lifecycle ──────────────────────────────────────────────────────────────
    status_counts: dict[str, int] = {
        'New': 0, 'Open': 0, 'In Progress': 0,
        'Under Review': 0, 'Resolved': 0, 'Closed': 0,
    }
    for r in rows:
        s = str(r.status or '')
        if s in status_counts:
            status_counts[s] += 1

    open_rows    = [r for r in rows if _is_open(r)]
    open_count   = len(open_rows)
    overdue_rows = [r for r in open_rows if compute_breach(_age_h(r), _tgt_h(r))]
    overdue_count = len(overdue_rows)
    high_or_above = sum(1 for r in rows if str(r.severity or '') in {'High', 'Very High'})
    linked_count  = sum(1 for r in rows if r.linked_risk_id is not None)
    within_sla    = total - sum(1 for r in rows if _breached(r))

    # Oldest open incident
    oldest = max(open_rows, key=_age_d, default=None)
    oldest_open_days = _age_d(oldest) if oldest else None
    oldest_open_id   = str(oldest.id) if oldest else None
    oldest_open_sev  = str(oldest.severity or '') if oldest else None
    oldest_open_date = oldest.reported_at.strftime('%-d %b %Y') if oldest and oldest.reported_at else None

    # ── MTTR and breach vs own target ─────────────────────────────────────────
    mttr_list: list[float] = []
    breach_count = 0
    worst_over = -1
    worst_r = None
    for r in rows:
        td = _tgt_d(r)
        if _is_term(r) and r.reported_at and r.resolved_at:
            rd = r.resolved_at.date() if isinstance(r.resolved_at, datetime) else r.resolved_at
            actual_d = (rd - r.reported_at).days
            mttr_list.append(float(actual_d))
            if actual_d > td:
                breach_count += 1
                if actual_d - td > worst_over:
                    worst_over = actual_d - td
                    worst_r = r
        elif _is_open(r) and r.reported_at:
            actual_d = _age_d(r)
            if actual_d > td:
                breach_count += 1
                if actual_d - td > worst_over:
                    worst_over = actual_d - td
                    worst_r = r

    resolved_count = len(mttr_list)
    median_days: float | None = None
    if mttr_list:
        s = sorted(mttr_list)
        n = len(s)
        median_days = round(s[n // 2] if n % 2 == 1 else (s[n // 2 - 1] + s[n // 2]) / 2, 1)

    impact_vals = [r.financial_impact for r in rows if r.financial_impact is not None]
    impact_total = sum(impact_vals, Decimal('0'))
    impact_count = len(impact_vals)

    # ── Component 1: Backlog pressure (25) ────────────────────────────────────
    PRESSURE_CEILING = 40
    pressure = sum(
        SEV_WEIGHT.get(str(r.severity or ''), 1) * (1 + _age_d(r) / max(1, _tgt_d(r)))
        for r in open_rows
    )
    score_1 = max(0, int(100 * max(0.0, 1.0 - pressure / PRESSURE_CEILING)))

    # ── Component 2: SLA conformance (30) ─────────────────────────────────────
    score_2 = int(100 * within_sla / max(1, total)) if total else 100

    # ── Component 3: Recurrence (15) ──────────────────────────────────────────
    cutoff_180 = today - timedelta(days=180)
    recent = [r for r in rows if r.reported_at and r.reported_at >= cutoff_180]
    pair_ct: dict[str, int] = defaultdict(int)
    for r in recent:
        pair_ct[f"{r.category or ''}|{r.business_unit or ''}"] += 1
    repeat_ct = sum(1 for r in recent if pair_ct[f"{r.category or ''}|{r.business_unit or ''}"] >= 2)
    score_3 = int(100 * (1 - repeat_ct / max(1, len(recent)))) if recent else 100

    # ── Component 4: Register linkage (20) ────────────────────────────────────
    score_4 = int(100 * linked_count / max(1, total)) if total else 100
    unlinked_rate = 1.0 - linked_count / max(1, total)

    # ── Component 5: Volume vs baseline (10) ─────────────────────────────────
    buckets: dict[int, int] = defaultdict(int)
    for r in rows:
        if r.reported_at:
            b = (today - r.reported_at).days // 30
            if b < 4:
                buckets[b] += 1
    prior_vols = [buckets[i] for i in range(1, 4) if buckets[i] > 0]
    has_baseline = len(prior_vols) >= 2
    score_5_raw: int | None = None
    if has_baseline:
        baseline_avg = sum(prior_vols) / len(prior_vols)
        score_5_raw = min(100, int(100 * min(baseline_avg / max(buckets[0], 1), 1.0)))

    # ── Composite health score ─────────────────────────────────────────────────
    if score_5_raw is not None:
        weights = [25, 30, 15, 20, 10]
        scores  = [score_1, score_2, score_3, score_4, score_5_raw]
        sups    = [False, False, False, False, False]
    else:
        weights = [28, 34, 17, 21, 0]
        scores  = [score_1, score_2, score_3, score_4, 0]
        sups    = [False, False, False, False, True]

    w_total = sum(weights)
    health_score = int(sum(sc * w for sc, w in zip(scores, weights)) / w_total) if w_total else 0

    names = ['Backlog pressure', 'SLA conformance', 'Recurrence', 'Register linkage', 'Volume vs baseline']
    components = [
        HealthComponent(name=n, weight=w, score=sc, suppressed=sup)
        for n, w, sc, sup in zip(names, weights, scores, sups)
    ]

    # ── Label + governance overrides ───────────────────────────────────────────
    label = (
        'Healthy'    if health_score >= 76 else
        'Monitoring' if health_score >= 51 else
        'At Risk'    if health_score >= 26 else
        'Critical'
    )
    very_high_breach = any(str(r.severity or '') == 'Very High' and compute_breach(_age_h(r), _tgt_h(r)) for r in open_rows)
    triple_breach    = any(_age_h(r) >= 3 * _tgt_h(r) for r in open_rows)
    if very_high_breach or triple_breach or overdue_count >= 2 or unlinked_rate > 0.5:
        if label in ('Healthy', 'Monitoring'):
            label = 'At Risk'

    # ── Flags ─────────────────────────────────────────────────────────────────
    health_flag: str | None = None
    worst_open_r = max(
        (r for r in open_rows if _age_d(r) > _tgt_d(r)), key=_age_d, default=None
    )
    if worst_open_r:
        health_flag = (
            f"{worst_open_r.id} ({worst_open_r.severity or '?'}) has been open "
            f"{_age_d(worst_open_r)}d against a {_tgt_d(worst_open_r)}-day target."
        )

    totals_flag: str | None = None
    if overdue_count > 0 and overdue_count == open_count:
        noun = 'incident is' if open_count == 1 else 'incidents are'
        totals_flag = f"All {open_count} open {noun} past their severity target."
    elif overdue_count > 0:
        totals_flag = f"{overdue_count} of {open_count} open incidents are past their severity target."

    res_flag: str | None = None
    if worst_r:
        res_flag = f"Worst overrun: {worst_r.id}, {_age_d(worst_r) if _is_open(worst_r) else int(mttr_list[0] if mttr_list else 0)}d against a {_tgt_d(worst_r)}-day target."

    return IncidentStatsResponse(
        health=IncidentHealth(
            score=health_score,
            label=label,
            within_sla=within_sla,
            within_sla_total=total,
            open_past_target=overdue_count,
            linked=linked_count,
            total=total,
            flag=health_flag,
            components=components,
            small_n=total < 5,
        ),
        totals=IncidentTotals(
            count=total,
            open_count=open_count,
            overdue_count=overdue_count,
            high_or_above=high_or_above,
            flag=totals_flag,
        ),
        lifecycle=IncidentLifecycle(
            new=status_counts['New'],
            open=status_counts['Open'],
            in_progress=status_counts['In Progress'],
            under_review=status_counts['Under Review'],
            resolved=status_counts['Resolved'],
            closed=status_counts['Closed'],
            oldest_open_days=oldest_open_days,
        ),
        resolution=IncidentResolution(
            oldest_open_days=oldest_open_days,
            oldest_open_id=oldest_open_id,
            oldest_open_severity=oldest_open_sev,
            oldest_open_date=oldest_open_date,
            median_days=median_days,
            resolved_count=resolved_count,
            breach_count=breach_count,
            breach_total=total,
            impact_total=impact_total,
            impact_count=impact_count,
            impact_total_count=total,
            flag=res_flag,
        ),
    )