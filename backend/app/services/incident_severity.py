# app/services/incident_severity.py
from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ResourceNotFoundError,
    DuplicateResourceError,
    ValidationError,
)
from app.models.incident import Incident
from app.models.incident_severity_level import IncidentSeverityLevel
from app.models.incident_sla_target import IncidentSlaTarget
from app.models.incident_escalation_rule import IncidentEscalationRule
from app.models.incident_severity_risk_band_map import IncidentSeverityRiskBandMap
from app.schemas.incident_severity import (
    BandMapResponse,
    EscalationRuleResponse,
    EscalationRuleUpsert,
    IncidentBreachPreviewItem,
    IncidentBreachPreviewResponse,
    IncidentSeverityConfigResponse,
    SeverityLevelResponse,
    SeverityLevelUpsert,
    SlaTargetResponse,
    SlaTargetUpsert,
)

logger = logging.getLogger(__name__)

_OPEN_STATUSES = {'New', 'Open', 'In Progress', 'Under Review'}

_DEFAULT_LEVELS: list[dict] = [
    {'label': 'Very High', 'sort_order': 1, 'color': '#c0392b',
     'target_value': 24.0,  'target_unit': 'hours', 'notify': 'admin_and_owner', 'band': 'Extreme (20-25)'},
    {'label': 'High',      'sort_order': 2, 'color': '#b7791f',
     'target_value': 72.0,  'target_unit': 'hours', 'notify': 'owner_only',      'band': 'High (15-19)'},
    {'label': 'Medium',    'sort_order': 3, 'color': '#0e8f6f',
     'target_value': 5.0,   'target_unit': 'days',  'notify': 'owner_only',      'band': 'Medium (8-14)'},
    {'label': 'Low',       'sort_order': 4, 'color': '#64748b',
     'target_value': 10.0,  'target_unit': 'days',  'notify': None,              'band': 'Low (1-7)'},
]


# ── Shared breach function ─────────────────────────────────────────────────────
# Single source of truth. Called by: get_stats (dashboard KPI),
# get_preview (settings screen), job_incident_escalation (cron).

def compute_breach(age_hours: float, target_hours: float) -> bool:
    return age_hours >= target_hours


# ── SLA map loader ─────────────────────────────────────────────────────────────

async def get_sla_map(db: AsyncSession, tenant_id: UUID) -> dict[str, float]:
    """Returns {severity_label: target_hours}. Empty dict if not yet configured."""
    rows = (await db.execute(
        select(IncidentSeverityLevel.label, IncidentSlaTarget.target_hours)
        .join(IncidentSlaTarget, IncidentSlaTarget.severity_id == IncidentSeverityLevel.id)
        .where(IncidentSeverityLevel.tenant_id == tenant_id)
    )).all()
    return {str(r.label): float(r.target_hours) for r in rows}


# ── Default seed ───────────────────────────────────────────────────────────────

async def _seed_defaults(db: AsyncSession, tenant_id: UUID) -> None:
    for d in _DEFAULT_LEVELS:
        level = IncidentSeverityLevel(
            tenant_id=tenant_id,
            label=d['label'],
            sort_order=d['sort_order'],
            color=d['color'],
        )
        db.add(level)
        await db.flush()
        await db.refresh(level)

        unit = str(d['target_unit'])
        value = float(d['target_value'])  # type: ignore[arg-type]
        hours = value if unit == 'hours' else value * 24

        db.add(IncidentSlaTarget(
            severity_id=level.id,
            target_value=value,
            target_unit=unit,
            target_hours=hours,
            notify_on_log=d['notify'],
        ))
        db.add(IncidentSeverityRiskBandMap(
            severity_id=level.id,
            risk_band_label=str(d['band']),
        ))

    db.add(IncidentEscalationRule(
        tenant_id=tenant_id,
        auto_escalate_on_breach=False,
        escalate_to='admin',
        flag_unowned_after_hours=48,
    ))
    await db.flush()


# ── Public API ─────────────────────────────────────────────────────────────────

async def get_config(db: AsyncSession, tenant_id: UUID) -> IncidentSeverityConfigResponse:
    count = (await db.execute(
        select(func.count()).select_from(IncidentSeverityLevel)
        .where(IncidentSeverityLevel.tenant_id == tenant_id)
    )).scalar() or 0

    if count == 0:
        await _seed_defaults(db, tenant_id)

    levels = (await db.execute(
        select(IncidentSeverityLevel)
        .where(IncidentSeverityLevel.tenant_id == tenant_id)
        .order_by(IncidentSeverityLevel.sort_order)
    )).scalars().all()

    level_ids = [lvl.id for lvl in levels]

    sla_targets = (await db.execute(
        select(IncidentSlaTarget)
        .where(IncidentSlaTarget.severity_id.in_(level_ids))
    )).scalars().all()

    band_map = (await db.execute(
        select(IncidentSeverityRiskBandMap)
        .where(IncidentSeverityRiskBandMap.severity_id.in_(level_ids))
    )).scalars().all()

    escalation = (await db.execute(
        select(IncidentEscalationRule)
        .where(IncidentEscalationRule.tenant_id == tenant_id)
    )).scalar_one_or_none()

    return IncidentSeverityConfigResponse(
        levels=[SeverityLevelResponse.model_validate(l) for l in levels],
        sla_targets=[SlaTargetResponse.model_validate(s) for s in sla_targets],
        escalation_rules=EscalationRuleResponse.model_validate(escalation) if escalation else None,
        band_map=[BandMapResponse.model_validate(b) for b in band_map],
    )


async def upsert_levels(
    db: AsyncSession,
    tenant_id: UUID,
    payload: list[SeverityLevelUpsert],
) -> list[SeverityLevelResponse]:
    for item in payload:
        if item.id is not None:
            level = (await db.execute(
                select(IncidentSeverityLevel)
                .where(IncidentSeverityLevel.id == item.id)
                .where(IncidentSeverityLevel.tenant_id == tenant_id)
            )).scalar_one_or_none()
            if not level:
                raise ResourceNotFoundError(f'Severity level {item.id} not found')
            level.label = item.label  # type: ignore[assignment]
            level.sort_order = item.sort_order  # type: ignore[assignment]
            level.color = item.color  # type: ignore[assignment]
            level.criteria_text = item.criteria_text  # type: ignore[assignment]
        else:
            db.add(IncidentSeverityLevel(
                tenant_id=tenant_id,
                label=item.label,
                sort_order=item.sort_order,
                color=item.color,
                criteria_text=item.criteria_text,
            ))

    await db.flush()

    rows = (await db.execute(
        select(IncidentSeverityLevel)
        .where(IncidentSeverityLevel.tenant_id == tenant_id)
        .order_by(IncidentSeverityLevel.sort_order)
    )).scalars().all()

    return [SeverityLevelResponse.model_validate(r) for r in rows]


async def delete_level(
    db: AsyncSession,
    tenant_id: UUID,
    level_id: UUID,
    reassign_to: UUID | None = None,
) -> None:
    count = (await db.execute(
        select(func.count()).select_from(IncidentSeverityLevel)
        .where(IncidentSeverityLevel.tenant_id == tenant_id)
    )).scalar() or 0

    if count <= 1:
        raise ValidationError('Cannot delete the last severity level')

    level = (await db.execute(
        select(IncidentSeverityLevel)
        .where(IncidentSeverityLevel.id == level_id)
        .where(IncidentSeverityLevel.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if not level:
        raise ResourceNotFoundError(f'Severity level {level_id} not found')

    incident_count = (await db.execute(
        select(func.count()).select_from(Incident)
        .where(Incident.tenant_id == tenant_id)
        .where(Incident.severity == level.label)
        .where(Incident.deleted_at.is_(None))
    )).scalar() or 0

    if incident_count > 0 and reassign_to is None:
        raise DuplicateResourceError(
            f'{incident_count} incident(s) use this severity. '
            f'Provide reassign_to to reassign before deleting.'
        )

    if incident_count > 0 and reassign_to is not None:
        target = (await db.execute(
            select(IncidentSeverityLevel)
            .where(IncidentSeverityLevel.id == reassign_to)
            .where(IncidentSeverityLevel.tenant_id == tenant_id)
        )).scalar_one_or_none()
        if not target:
            raise ResourceNotFoundError(f'Reassignment target level {reassign_to} not found')

        await db.execute(
            update(Incident)
            .where(Incident.tenant_id == tenant_id)
            .where(Incident.severity == level.label)
            .where(Incident.deleted_at.is_(None))
            .values(severity=target.label)
        )
        await db.flush()

    await db.execute(
        delete(IncidentSeverityLevel)
        .where(IncidentSeverityLevel.id == level_id)
        .where(IncidentSeverityLevel.tenant_id == tenant_id)
    )
    await db.flush()


async def upsert_sla(
    db: AsyncSession,
    tenant_id: UUID,
    payload: list[SlaTargetUpsert],
) -> list[SlaTargetResponse]:
    level_ids = [item.severity_id for item in payload]

    valid_ids = set((await db.execute(
        select(IncidentSeverityLevel.id)
        .where(IncidentSeverityLevel.tenant_id == tenant_id)
        .where(IncidentSeverityLevel.id.in_(level_ids))
    )).scalars().all())

    for item in payload:
        if item.severity_id not in valid_ids:
            raise ResourceNotFoundError(
                f'Severity level {item.severity_id} not found for this workspace'
            )

    for item in payload:
        target_hours = (
            item.target_value if item.target_unit == 'hours'
            else item.target_value * 24
        )
        existing = (await db.execute(
            select(IncidentSlaTarget)
            .where(IncidentSlaTarget.severity_id == item.severity_id)
        )).scalar_one_or_none()

        if existing:
            existing.target_value = item.target_value  # type: ignore[assignment]
            existing.target_unit = item.target_unit  # type: ignore[assignment]
            existing.target_hours = target_hours  # type: ignore[assignment]
            existing.notify_on_log = item.notify_on_log  # type: ignore[assignment]
        else:
            db.add(IncidentSlaTarget(
                severity_id=item.severity_id,
                target_value=item.target_value,
                target_unit=item.target_unit,
                target_hours=target_hours,
                notify_on_log=item.notify_on_log,
            ))

    await db.flush()

    rows = (await db.execute(
        select(IncidentSlaTarget)
        .where(IncidentSlaTarget.severity_id.in_(level_ids))
    )).scalars().all()

    return [SlaTargetResponse.model_validate(r) for r in rows]


async def upsert_escalation(
    db: AsyncSession,
    tenant_id: UUID,
    payload: EscalationRuleUpsert,
) -> EscalationRuleResponse:
    existing = (await db.execute(
        select(IncidentEscalationRule)
        .where(IncidentEscalationRule.tenant_id == tenant_id)
    )).scalar_one_or_none()

    if existing:
        existing.auto_escalate_on_breach = payload.auto_escalate_on_breach  # type: ignore[assignment]
        existing.escalate_to = payload.escalate_to  # type: ignore[assignment]
        existing.flag_unowned_after_hours = payload.flag_unowned_after_hours  # type: ignore[assignment]
    else:
        existing = IncidentEscalationRule(
            tenant_id=tenant_id,
            auto_escalate_on_breach=payload.auto_escalate_on_breach,
            escalate_to=payload.escalate_to,
            flag_unowned_after_hours=payload.flag_unowned_after_hours,
        )
        db.add(existing)

    await db.flush()
    await db.refresh(existing)
    return EscalationRuleResponse.model_validate(existing)


async def get_preview(
    db: AsyncSession,
    tenant_id: UUID,
) -> IncidentBreachPreviewResponse:
    sla_map = await get_sla_map(db, tenant_id)
    now = datetime.now(timezone.utc)

    incidents = (await db.execute(
        select(Incident)
        .where(Incident.tenant_id == tenant_id)
        .where(Incident.deleted_at.is_(None))
        .order_by(Incident.created_at.desc())
        .limit(10)
    )).scalars().all()

    items: list[IncidentBreachPreviewItem] = []
    breach_count = 0
    unowned_count = 0

    for inc in incidents:
        if inc.created_at is None:
            continue

        created = inc.created_at
        if hasattr(created, 'tzinfo') and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)

        end_time = inc.resolved_at or now
        if hasattr(end_time, 'tzinfo') and end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)

        age_hours = (end_time - created).total_seconds() / 3600
        severity_label = str(inc.severity or '')
        target_h = sla_map.get(severity_label)
        is_open = str(inc.status or '') in _OPEN_STATUSES
        is_breach = compute_breach(age_hours, target_h) if target_h is not None else False

        if is_breach and is_open:
            breach_count += 1
        if not str(inc.assigned_to or '').strip() and is_open:
            unowned_count += 1

        items.append(IncidentBreachPreviewItem(
            incident_id=str(inc.id or ''),
            severity=severity_label,
            age_hours=round(age_hours, 1),
            target_hours=target_h,
            is_breach=is_breach,
        ))

    total = len(items)
    breach_rate = round(breach_count / total * 100) if total else 0

    return IncidentBreachPreviewResponse(
        items=items,
        breach_count=breach_count,
        breach_rate_pct=breach_rate,
        unowned_count=unowned_count,
    )