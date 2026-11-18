# app/services/incident.py

import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundError, ValidationError
from app.models.incident import Incident
from app.models.risk import Risk
from app.models.audit_log import AuditLog
from app.schemas.incident import (
    IncidentContext,
    IncidentCreate,
    IncidentHistoryItem,
    IncidentRiskRef,
    IncidentRow,
    IncidentStep,
    IncidentUpdate,
    IncidentResponse,
    IncidentListResponse,
    IncidentViewCounts,
    TargetPreviewRequest,
    TargetPreviewResponse,
    IncidentStatsResponse,
    IncidentCost,
    CategoryDriver,
    SeverityPerformance,
    IncidentHealth,
    IncidentTotals,
    IncidentLifecycle,
    IncidentResolution,
    HealthComponent,
    MonthlyTrend,
    TopDriver,
)
from app.schemas.risk import display_title
from app.services.recycle import soft_delete
from app.services.incident_severity import (
    compute_breach,
    get_sla_map,
    get_severity_ranks,
    high_severity_labels,
)
from app.services.incident_status import (
    OPEN_STATUSES,
    TERMINAL_STATUSES,
    effective_sla,
    is_open,
    next_label,
    next_status,
    normalise_status,
    stage_note,
    stepper,
    target_days,
    target_hours_for,
    target_state,
    resolve_by,
)
from app.services.lookup import covering_risk_categories, get_lookups
from app.services.matrix_config import _get_or_create as _get_matrix
from app.services.risk_status import is_contradicted

HISTORY_LIMIT = 10
SUGGESTED_RISK_LIMIT = 3
VIEW_KEYS: tuple[str, ...] = ('open', 'unlinked', 'high', 'resolved', 'all')
# Fields a partial update may not clear: the incident would lose what identifies it.
_REQUIRED_ON_UPDATE: frozenset[str] = frozenset(
    {'description', 'category', 'severity', 'status', 'reported_by', 'reported_at'}
)


# Backlog weight by severity rank, most severe first. Deeper levels weigh 1.
# Superlinear on purpose: one top-severity incident outweighs several minor ones.
_RANK_WEIGHTS: tuple[int, ...] = (8, 5, 2, 1)


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


async def _validate_linked_risk(db: AsyncSession, tenant_id: UUID, risk_id: str) -> None:
    """A linked risk must exist, live, in the same workspace."""
    exists = await db.scalar(
        select(Risk.id).where(
            Risk.tenant_id == tenant_id,
            Risk.id == risk_id,
            Risk.deleted_at.is_(None),
        )
    )
    if exists is None:
        raise ValidationError(f'Risk {risk_id} does not exist in this workspace.')


async def _validate_severity(db: AsyncSession, tenant_id: UUID, severity: str) -> None:
    """Severity must be one of the workspace's configured levels (or the defaults before seeding)."""
    ranks = await get_severity_ranks(db, tenant_id)
    if severity not in ranks:
        raise ValidationError(f"Severity '{severity}' is not one of this workspace's levels: {', '.join(ranks)}.")


class _Coverage:
    """Which incident categories a live risk covers (same rule as the dashboard correlation)."""

    def __init__(self, cat_map: dict[str, list[str]], risk_cats: list[str], held: set[str]) -> None:
        self.cat_map = cat_map
        self.risk_cats = risk_cats
        self.held = held

    def covering(self, inc_cat: str | None) -> list[str]:
        cat = str(inc_cat or 'Other')
        return [c for c in covering_risk_categories(cat, self.cat_map, self.risk_cats) if c in self.held]


async def _coverage(db: AsyncSession, tenant_id: UUID) -> _Coverage:
    lookups = await get_lookups(db, tenant_id)
    held = (await db.execute(
        select(Risk.category).distinct().where(
            Risk.tenant_id == tenant_id, Risk.deleted_at.is_(None), Risk.category.is_not(None),
        )
    )).scalars().all()
    return _Coverage(lookups.incident_category_map, lookups.category, {str(c) for c in held})


async def _risk_titles(db: AsyncSession, tenant_id: UUID, ids: set[str]) -> dict[str, str]:
    """Display titles of live risks, by ID."""
    if not ids:
        return {}
    rows = (await db.execute(
        select(Risk.id, Risk.title, Risk.description).where(
            Risk.tenant_id == tenant_id, Risk.deleted_at.is_(None), Risk.id.in_(ids),
        )
    )).all()
    return {str(r.id): display_title(r.title, r.description, str(r.id)) for r in rows}


class _RowContext:
    """Workspace settings every row label needs, loaded once per request."""

    def __init__(self, sla: dict[str, float], high: set[str], cov: _Coverage, today: date, now: datetime) -> None:
        self.sla = sla
        self.high = high
        self.cov = cov
        self.today = today
        self.now = now


async def _row_context(db: AsyncSession, tenant_id: UUID) -> _RowContext:
    ranks = await get_severity_ranks(db, tenant_id)
    return _RowContext(
        sla=effective_sla(await get_sla_map(db, tenant_id)),
        high=set(high_severity_labels(ranks)),
        cov=await _coverage(db, tenant_id),
        today=date.today(),
        now=datetime.now(timezone.utc),
    )


def _age_hours(reported_at: date | None, now: datetime) -> float:
    if reported_at is None:
        return 0.0
    ref = datetime(reported_at.year, reported_at.month, reported_at.day, tzinfo=timezone.utc)
    return (now - ref).total_seconds() / 3600


def _to_row(inc: Incident, ctx: _RowContext, titles: dict[str, str]) -> IncidentRow:
    base = IncidentResponse.model_validate(inc)
    hours = target_hours_for(base.severity, ctx.sla)
    open_ = is_open(base.status)
    breached = open_ and base.reported_at is not None and compute_breach(_age_hours(base.reported_at, ctx.now), hours)
    state, text_, due = target_state(
        status=base.status, reported_at=base.reported_at, resolved_at=base.resolved_at,
        hours=hours, breached=breached, today=ctx.today,
    )
    link = str(base.linked_risk_id or '').strip()
    if link:
        link_state = 'linked'
    elif ctx.cov.covering(base.category):
        link_state = 'unlinked'
    else:
        link_state = 'uncovered'
    return IncidentRow(
        **base.model_dump(),
        display_title=display_title(base.title, base.description, base.id),
        is_open=open_,
        is_high=str(base.severity or '') in ctx.high,
        target_state=state,
        target_text=text_,
        resolve_by=due,
        target_days=target_days(hours),
        link_state=link_state,
        linked_risk_title=titles.get(link) if link else None,
    )


def _filtered(
    q: Any,
    *,
    category: str | None,
    severity: str | None,
    status: str | None,
    business_unit: str | None,
    owner: str | None,
    search: str | None,
) -> Any:
    """Filters shared by the list and the quick-view counts, so both agree."""
    if category:
        q = q.where(Incident.category == category)
    if severity:
        q = q.where(Incident.severity == severity)
    if status:
        q = q.where(Incident.status == normalise_status(status))
    if business_unit:
        q = q.where(Incident.business_unit == business_unit)
    if owner:
        q = q.where(Incident.assigned_to == owner)
    if search:
        term = f'%{search.strip().lower()}%'
        q = q.where(
            func.lower(Incident.id).like(term)
            | func.lower(func.coalesce(Incident.title, '')).like(term)
            | func.lower(func.coalesce(Incident.description, '')).like(term)
            | func.lower(func.coalesce(Incident.category, '')).like(term)
            | func.lower(func.coalesce(Incident.reported_by, '')).like(term)
            | func.lower(func.coalesce(Incident.assigned_to, '')).like(term)
            | func.lower(func.coalesce(Incident.affected_asset, '')).like(term)
            | func.lower(func.coalesce(Incident.business_unit, '')).like(term)
        )
    return q


def _unlinked() -> Any:
    return func.coalesce(func.trim(Incident.linked_risk_id), '') == ''


def _view_clause(view: str, high: set[str]) -> Any:
    open_ = Incident.status.in_(OPEN_STATUSES)
    if view == 'open':
        return open_
    if view == 'unlinked':
        return open_ & _unlinked()
    if view == 'high':
        return open_ & Incident.severity.in_(high)
    if view == 'resolved':
        return Incident.status.in_(TERMINAL_STATUSES)
    return None


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
    *,
    view: str | None = None,
    owner: str | None = None,
) -> IncidentListResponse:
    """Incident log, newest first. Each row carries its target, link and severity labels."""
    if view is not None and view not in VIEW_KEYS:
        raise ValidationError(f"view must be one of {', '.join(VIEW_KEYS)}")
    ctx = await _row_context(db, tenant_id)
    q = (
        select(Incident)
        .where(Incident.tenant_id == tenant_id)
        .where(Incident.deleted_at.is_(None))
    )
    if incident_id:
        q = q.where(func.upper(Incident.id) == incident_id.strip().upper())
    q = _filtered(q, category=category, severity=severity, status=status,
                  business_unit=business_unit, owner=owner, search=search)
    clause = _view_clause(view or 'all', ctx.high)
    if clause is not None:
        q = q.where(clause)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
    incidents = (await db.execute(
        q.order_by(Incident.reported_at.desc().nulls_last(), Incident.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).scalars().all()

    titles = await _risk_titles(
        db, tenant_id, {str(i.linked_risk_id).strip() for i in incidents if str(i.linked_risk_id or '').strip()},
    )
    return IncidentListResponse(
        items=[_to_row(i, ctx, titles) for i in incidents],
        total=total,
        page=page,
        page_size=page_size,
    )


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


async def get_view_counts(
    db: AsyncSession,
    tenant_id: UUID,
    *,
    category: str | None = None,
    severity: str | None = None,
    owner: str | None = None,
    search: str | None = None,
) -> IncidentViewCounts:
    """Quick-view counts (they follow the filters) and a one-line summary of the whole log."""
    ranks = await get_severity_ranks(db, tenant_id)
    high = set(high_severity_labels(ranks))
    base = select(Incident.id).where(Incident.tenant_id == tenant_id, Incident.deleted_at.is_(None))
    filtered = _filtered(base, category=category, severity=severity, status=None,
                         business_unit=None, owner=owner, search=search)

    async def _count(q: Any) -> int:
        return int((await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0)

    counts: dict[str, int] = {}
    for key in VIEW_KEYS:
        clause = _view_clause(key, high)
        counts[key] = await _count(filtered.where(clause) if clause is not None else filtered)

    open_all = await _count(base.where(_view_clause('open', high)))
    high_all = await _count(base.where(_view_clause('high', high)))
    unlinked_all = await _count(base.where(_view_clause('unlinked', high)))
    if open_all == 0:
        total_all = await _count(base)
        summary = 'No open incidents.' if total_all else 'No incidents logged yet.'
    else:
        summary = f"{open_all} open"
        if high_all:
            summary += f", {high_all} of them high or above"
        summary += "."
        if unlinked_all:
            summary += f" {_plural(unlinked_all, 'open incident has', 'open incidents have')} no linked risk."

    owners = (await db.execute(
        select(Incident.assigned_to).distinct().where(
            Incident.tenant_id == tenant_id, Incident.deleted_at.is_(None),
            func.coalesce(func.trim(Incident.assigned_to), '') != '',
        ).order_by(Incident.assigned_to)
    )).scalars().all()

    top = [label for label, rank in sorted(ranks.items(), key=lambda p: p[1])]
    high_label = f"{top[1]} or above" if len(top) > 1 else (f"{top[0]}" if top else "High or above")
    return IncidentViewCounts(
        **counts, high_label=high_label, summary=summary, owners=[str(o) for o in owners],
    )


async def get_incident(
    db: AsyncSession,
    tenant_id: UUID,
    incident_id: str,
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
    return IncidentResponse.model_validate(inc)


async def create_incident(
    db: AsyncSession,
    tenant_id: UUID,
    payload: IncidentCreate,
    created_by: str,
) -> IncidentResponse:
    await _validate_severity(db, tenant_id, payload.severity)
    linked = (payload.linked_risk_id or '').strip() or None
    if linked:
        await _validate_linked_risk(db, tenant_id, linked)
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
        linked_risk_id=linked,
        linked_control=payload.linked_control,
        control_outcome=payload.control_outcome if linked else None,
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
        resolved_at=payload.resolved_at or (
            datetime.now(timezone.utc) if normalise_status(payload.status) in TERMINAL_STATUSES else None
        ),
    )
    db.add(inc)
    await db.flush()
    await db.refresh(inc)

    await _audit(
        db, tenant_id, created_by, 'CREATE', inc_id,
        f'Logged as {inc.status}: {display_title(payload.title, payload.description, inc_id)[:60]}',
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

    changes = {
        k: v for k, v in patch.model_dump(exclude_unset=True).items()
        if not (v is None and k in _REQUIRED_ON_UPDATE)
    }
    if 'severity' in changes:
        await _validate_severity(db, tenant_id, str(changes['severity']))
    if 'linked_risk_id' in changes:
        changes['linked_risk_id'] = str(changes['linked_risk_id'] or '').strip() or None
        if changes['linked_risk_id']:
            await _validate_linked_risk(db, tenant_id, changes['linked_risk_id'])
        else:
            changes['control_outcome'] = None   # an outcome describes a linked risk's control

    old_status = normalise_status(str(inc.status or ''))
    for field, value in changes.items():
        setattr(inc, field, value)

    new_status = normalise_status(str(inc.status or ''))
    inc.status = new_status  # type: ignore[assignment]
    if new_status in TERMINAL_STATUSES and inc.resolved_at is None:
        # Mirrors GAS closeDate: the first move to Resolved or Closed stamps the date.
        inc.resolved_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    elif new_status not in TERMINAL_STATUSES and 'resolved_at' not in changes:
        # Reopened: the old date would make resolution time and SLA results wrong.
        inc.resolved_at = None  # type: ignore[assignment]

    await db.flush()
    await db.refresh(inc)

    summary = (
        f'Moved from {old_status} to {new_status}' if new_status != old_status
        else f'Updated {", ".join(sorted(changes)) or "nothing"}'
    )
    await _audit(db, tenant_id, updated_by, 'UPDATE', incident_id, summary[:200])

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
            Incident.title,
            Incident.status,
            Incident.severity,
            Incident.category,
            Incident.business_unit,
            Incident.reported_at,
            Incident.resolved_at,
            Incident.financial_impact,
            Incident.linked_risk_id,
            Incident.created_at,
            Incident.impact_confidence,
        )
        .where(Incident.tenant_id == tenant_id)
        .where(Incident.deleted_at.is_(None))
    )
    rows = result.all()
    total = len(rows)

    OPEN_STATES     = OPEN_STATUSES
    TERMINAL_STATES = TERMINAL_STATUSES
    today   = date.today()
    now_utc = datetime.now(timezone.utc)

    sla_map     = await get_sla_map(db, tenant_id)
    sev_ranks   = await get_severity_ranks(db, tenant_id)
    high_labels = set(high_severity_labels(sev_ranks))
    top_labels  = {label for label, rank in sev_ranks.items() if rank == 0}

    def _sev_weight(r) -> int:  # type: ignore[no-untyped-def]
        rank = sev_ranks.get(str(r.severity or ''))
        return _RANK_WEIGHTS[rank] if rank is not None and rank < len(_RANK_WEIGHTS) else 1
    eff_h   = effective_sla(sla_map)
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
        'New': 0, 'Triaged': 0, 'Investigating': 0,
        'Remediating': 0, 'Resolved': 0, 'Closed': 0,
    }
    for r in rows:
        s = normalise_status(str(r.status or ''))
        if s in status_counts:
            status_counts[s] += 1

    open_rows    = [r for r in rows if _is_open(r)]
    open_count   = len(open_rows)
    overdue_rows = [r for r in open_rows if compute_breach(_age_h(r), _tgt_h(r))]
    overdue_count = len(overdue_rows)
    high_or_above = sum(1 for r in rows if str(r.severity or '') in high_labels)
    linked_count   = sum(1 for r in rows if r.linked_risk_id is not None)
    within_sla     = total - sum(1 for r in rows if _breached(r))
    open_over_150d = sum(1 for r in open_rows if _age_d(r) > 150)

    # Oldest open incident
    oldest = max(open_rows, key=_age_d, default=None)
    oldest_open_days = _age_d(oldest) if oldest else None
    oldest_open_id   = str(oldest.id) if oldest else None
    oldest_open_sev  = str(oldest.severity or '') if oldest else None
    oldest_open_date = (
        f"{oldest.reported_at.day} {oldest.reported_at.strftime('%b %Y')}"
        if oldest and oldest.reported_at else None
    )

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
        _sev_weight(r) * (1 + _age_d(r) / max(1, _tgt_d(r)))
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
    top_severity_breach = any(
        str(r.severity or '') in top_labels and compute_breach(_age_h(r), _tgt_h(r))
        for r in open_rows
    )
    triple_breach    = any(_age_h(r) >= 3 * _tgt_h(r) for r in open_rows)
    if total > 0 and (top_severity_breach or triple_breach or overdue_count >= 2 or unlinked_rate > 0.5):
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
        if _is_open(worst_r):
            wr_days = _age_d(worst_r)
        elif worst_r.reported_at and worst_r.resolved_at:
            wr_rd = worst_r.resolved_at.date() if isinstance(worst_r.resolved_at, datetime) else worst_r.resolved_at
            wr_days = (wr_rd - worst_r.reported_at).days
        else:
            wr_days = 0
        res_flag = f"Worst overrun: {worst_r.id}, {wr_days}d against a {_tgt_d(worst_r)}-day target."

    # ── Monthly trend (last 6 months) ─────────────────────────────────────────
    trend_keys: list[tuple[date, str]] = []
    for i in range(5, -1, -1):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        d0 = date(y, m, 1)
        trend_keys.append((d0, d0.strftime('%b %Y')))

    monthly_bucket: dict[str, int] = defaultdict(int)
    for r in rows:
        if r.reported_at:
            monthly_bucket[r.reported_at.isoformat()[:7]] += 1

    monthly_trend = [
        MonthlyTrend(month=lbl, count=monthly_bucket.get(d0.isoformat()[:7], 0))
        for d0, lbl in trend_keys
    ]

    # ── Top drivers: open incidents ranked by age × recurrence factor ──────────
    def _rfactor(r) -> int:  # type: ignore[no-untyped-def]
        return 2 if pair_ct.get(f"{r.category or ''}|{r.business_unit or ''}", 0) >= 2 else 1

    top_drivers = [
        TopDriver(
            id=str(r.id),
            title=str(r.title or '') or None,
            severity=str(r.severity or '') or None,
            age_days=_age_d(r),
            category=str(r.category or '') or None,
            status=str(r.status or '') or None,
        )
        for r in sorted(open_rows, key=lambda r: _age_d(r) * _rfactor(r), reverse=True)[:5]
    ]

    # ── Analytics: per-severity targets, cost list, category drivers ──────────
    def _median(vals: list[float]) -> float | None:
        if not vals:
            return None
        s = sorted(vals)
        n = len(s)
        return round(s[n // 2] if n % 2 == 1 else (s[n // 2 - 1] + s[n // 2]) / 2, 1)

    sev_labels = set(eff_h) | {str(r.severity) for r in rows if r.severity}
    by_severity: list[SeverityPerformance] = []
    for sev in sorted(sev_labels, key=lambda s: (sev_ranks.get(s, len(sev_ranks)), s)):
        sev_rows = [r for r in rows if str(r.severity or '') == sev]
        td = sla_d.get(sev, 5)
        days: list[float] = []
        met = 0
        for r in sev_rows:
            if _is_term(r) and r.reported_at and r.resolved_at:
                rd = r.resolved_at.date() if isinstance(r.resolved_at, datetime) else r.resolved_at
                d = (rd - r.reported_at).days
                days.append(float(d))
                met += int(d <= td)
        by_severity.append(SeverityPerformance(
            severity=sev,
            target_days=td,
            open=sum(1 for r in sev_rows if _is_open(r)),
            resolved=len(days),
            met=met,
            median_days=_median(days),
        ))

    costs = [
        IncidentCost(
            id=str(r.id),
            title=str(r.title or '') or None,
            # Fixed two decimals: some stored values come back in exponent form (4.20E+6).
            amount=Decimal(r.financial_impact).quantize(Decimal('0.01')),
            confidence=str(r.impact_confidence or '') or None,
        )
        for r in sorted(
            (r for r in rows if r.financial_impact is not None),
            key=lambda r: (-r.financial_impact, str(r.id)),
        )[:10]
    ]

    cat_groups: dict[str, list[Any]] = defaultdict(list)
    for r in rows:
        cat_groups[str(r.category or 'Uncategorised')].append(r)
    by_category = sorted(
        (
            CategoryDriver(
                category=cat,
                count=len(grp),
                open=sum(1 for r in grp if _is_open(r)),
                unlinked_ids=sorted(str(r.id) for r in grp if not str(r.linked_risk_id or '').strip()),
            )
            for cat, grp in cat_groups.items()
        ),
        key=lambda c: (-c.count, -c.open, c.category),
    )

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
            open_over_150d=open_over_150d,
            flag=totals_flag,
        ),
        lifecycle=IncidentLifecycle(
            new=status_counts['New'],
            triaged=status_counts['Triaged'],
            investigating=status_counts['Investigating'],
            remediating=status_counts['Remediating'],
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
        monthly_trend=monthly_trend,
        top_drivers=top_drivers,
        by_severity=by_severity,
        costs=costs,
        by_category=by_category,
    )

# ── UI step 6: side panel context and target preview ─────────────────────────

async def _suggested(db: AsyncSession, tenant_id: UUID, cats: list[str]) -> list[IncidentRiskRef]:
    """Live risks in the categories that cover an incident, highest residual first."""
    if not cats:
        return []
    rows = (await db.execute(
        select(Risk.id, Risk.title, Risk.description, Risk.residual).where(
            Risk.tenant_id == tenant_id, Risk.deleted_at.is_(None), Risk.category.in_(cats),
        ).order_by(Risk.residual.desc().nulls_last(), Risk.id).limit(SUGGESTED_RISK_LIMIT)
    )).all()
    return [
        IncidentRiskRef(
            id=str(r.id), title=display_title(r.title, r.description, str(r.id)),
            residual=int(float(r.residual) + 0.5) if r.residual is not None else None,  # type: ignore[arg-type]
        )
        for r in rows
    ]


def _link_note(category: str | None, covered: bool, has_suggestions: bool) -> str:
    cat = str(category or 'Other')
    if not covered:
        return f"No risk on the register covers {cat}, so this exposure is not in any score."
    if has_suggestions:
        return f"These risks cover {cat}. Link the one this incident belongs to."
    return "Find the risk this incident belongs to."


async def get_incident_context(db: AsyncSession, tenant_id: UUID, incident_id: str) -> IncidentContext:
    """What the incident side panel shows: stages, linked risk or suggestions, and history."""
    inc = (await db.execute(
        select(Incident).where(
            Incident.tenant_id == tenant_id, Incident.id == incident_id, Incident.deleted_at.is_(None),
        )
    )).scalar_one_or_none()
    if inc is None:
        raise ResourceNotFoundError(f'Incident {incident_id} not found')

    ctx = await _row_context(db, tenant_id)
    link = str(inc.linked_risk_id or '').strip()
    linked: IncidentRiskRef | None = None
    titles: dict[str, str] = {}
    if link:
        risk = (await db.execute(
            select(Risk.id, Risk.title, Risk.description, Risk.residual).where(
                Risk.tenant_id == tenant_id, Risk.id == link, Risk.deleted_at.is_(None),
            )
        )).first()
        if risk is not None:
            title = display_title(risk.title, risk.description, str(risk.id))
            titles[link] = title
            linked = IncidentRiskRef(
                id=link, title=title,
                residual=int(float(risk.residual) + 0.5) if risk.residual is not None else None,  # type: ignore[arg-type]
            )
        else:
            # Soft reference (decision 5 Sep 2026): keep the ID, say the risk is gone.
            linked = IncidentRiskRef(id=link, title='No longer on the register', on_register=False)

    row = _to_row(inc, ctx, titles)
    cats = ctx.cov.covering(row.category)
    suggestions = [] if link else await _suggested(db, tenant_id, cats)

    audit_rows = (await db.execute(
        select(AuditLog.created_at, AuditLog.user_email, AuditLog.action, AuditLog.summary)
        .where(
            AuditLog.tenant_id == tenant_id,
            AuditLog.module == 'Incident',
            AuditLog.record_id == incident_id,
        )
        .order_by(AuditLog.created_at.desc())
        .limit(HISTORY_LIMIT)
    )).all()

    return IncidentContext(
        incident=row,
        steps=[IncidentStep(name=n, state=st) for n, st in stepper(row.status)],
        stage_note=stage_note(row.status),
        next_status=next_status(row.status),
        next_label=next_label(row.status),
        linked_risk=linked,
        covered=bool(cats),
        link_note='' if link else _link_note(row.category, bool(cats), bool(suggestions)),
        suggested_risks=suggestions,
        history=[
            IncidentHistoryItem(at=a.created_at, user=a.user_email, action=a.action, summary=a.summary)
            for a in audit_rows
        ],
    )


async def target_preview(
    db: AsyncSession, tenant_id: UUID, payload: TargetPreviewRequest,
) -> TargetPreviewResponse:
    """Target date and what saving will change, for the log form. Writes nothing."""
    ranks = await get_severity_ranks(db, tenant_id)
    if payload.severity not in ranks:
        raise ValidationError(f"Severity '{payload.severity}' is not one of this workspace's levels.")
    sla = effective_sla(await get_sla_map(db, tenant_id))
    hours = target_hours_for(payload.severity, sla)
    days = target_days(hours)
    reported = payload.reported_at or date.today()
    cov = await _coverage(db, tenant_id)
    cats = cov.covering(payload.category) if payload.category else []
    covered = bool(cats)
    link = (payload.linked_risk_id or '').strip()
    is_high = payload.severity in set(high_severity_labels(ranks))

    outcomes = ['It appears as New in the incident log, with this target.']
    suggestions: list[IncidentRiskRef] = []
    if link:
        risk = (await db.execute(
            select(Risk.id, Risk.control_effectiveness).where(
                Risk.tenant_id == tenant_id, Risk.id == link, Risk.deleted_at.is_(None),
            )
        )).first()
        if risk is None:
            raise ValidationError(f'Risk {link} does not exist in this workspace.')
        outcomes.append(f"It shows under {link} in the Risk Register panel and counts as that risk materialising.")
        matrix = await _get_matrix(db, tenant_id)
        rating = int(risk.control_effectiveness) if risk.control_effectiveness is not None else None  # type: ignore[arg-type]
        if is_contradicted(rating, int(matrix.ce_scale), True):  # type: ignore[arg-type]
            outcomes.append(f"{link} is rated well controlled, so Analytics will mark its control rating as contradicted.")
    else:
        if payload.category and not covered:
            outcomes.append(
                f"No risk covers {payload.category}. Analytics shows it as a register blind spot until one is logged."
            )
        else:
            outcomes.append('With no linked risk, it counts as unlinked on Analytics.')
        if is_high:
            outcomes.append(f"A {payload.severity} incident with no linked risk is named in the Home summary.")
        suggestions = await _suggested(db, tenant_id, cats)

    return TargetPreviewResponse(
        severity=payload.severity,
        target_hours=hours,
        target_days=days,
        resolve_by=resolve_by(reported, hours),
        due_note=f"{payload.severity} incidents have {days} {'day' if days == 1 else 'days'} from the date reported.",
        covered=covered,
        suggested_risks=suggestions,
        outcomes=outcomes,
    )
