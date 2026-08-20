# app/services/risk.py

import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, delete, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.risk import Risk
from app.models.audit_log import AuditLog
from app.schemas.risk import (
    RiskCreate, RiskUpdate, RiskResponse,
    RiskListResponse, RiskQuotaInfo,
    BulkImportRequest, BulkImportResponse, BulkImportError,
    RiskStatsResponse, ConcentrationItem, TopOwner,
    ExposureIndex, RiskVolume, ControlSignal,
)
from app.core.config import settings
from app.core.exceptions import ResourceNotFoundError, QuotaExceededError
from app.models.matrix_config import MatrixConfig
from app.services.matrix_config import _get_or_create as _get_matrix
from app.services.phase_one import (
    compute_movement, compute_freshness,
    log_risk_history, log_activity,
)
from app.services.recycle import soft_delete

logger = logging.getLogger(__name__)

# ── Private helpers ───────────────────────────────────────────────────────────

def _score(
    likelihood: int,
    impact_score: int,
    control_effectiveness: int | None,
    cfg: MatrixConfig | None = None,
) -> dict:
    ce       = (control_effectiveness or 0) / 100
    severity = likelihood * impact_score
    residual = round(severity * (1 - ce), 2)

    if cfg is not None:
        bc = int(cfg.band_count)                            # type: ignore[arg-type]
        # Descending: highest band first. Skip bands beyond band_count.
        band_defs = [
            (5, int(cfg.band_extreme_min or 0),  str(cfg.band_5_label or 'Extreme')),  # type: ignore[arg-type]
            (4, int(cfg.band_critical_min or 0), str(cfg.band_4_label or 'Critical')), # type: ignore[arg-type]
            (3, int(cfg.band_high_min or 0),     str(cfg.band_3_label or 'High')),     # type: ignore[arg-type]
            (2, int(cfg.band_medium_min or 0),   str(cfg.band_2_label or 'Medium')),   # type: ignore[arg-type]
        ]
        level_index = 1
        level       = str(cfg.band_1_label or 'Low')       # type: ignore[arg-type]
        for idx, threshold, label in band_defs:
            if idx <= bc and severity >= threshold:
                level_index = idx
                level       = label
                break
    else:
        bc = 4
        if severity >= 17:
            level_index, level = 4, 'Critical'
        elif severity >= 10:
            level_index, level = 3, 'High'
        elif severity >= 5:
            level_index, level = 2, 'Medium'
        else:
            level_index, level = 1, 'Low'

    elevated_threshold = max(bc - 1, 2)
    is_elevated = level_index >= elevated_threshold

    return {
        'severity':       Decimal(str(severity)),
        'residual':       Decimal(str(residual)),
        'overall_rating': Decimal(str(residual)),
        'level':          level,
        'level_index':    level_index,
        'is_elevated':    is_elevated,
    }


async def _next_id(db: AsyncSession, tenant_id: UUID) -> str:
    result = await db.execute(
        text("""
            SELECT COALESCE(MAX(
                CASE WHEN id ~ '^R-[0-9]+$'
                THEN CAST(SUBSTRING(id FROM 3) AS INTEGER)
                ELSE 0 END
            ), 0)
            FROM risks
            WHERE tenant_id = :tid
        """),
        {'tid': str(tenant_id)},
    )
    max_num = result.scalar() or 0
    return f'R-{max_num + 1:03d}'


async def _quota(db: AsyncSession, tenant_id: UUID) -> RiskQuotaInfo:
    result = await db.execute(
        select(func.count())
        .select_from(Risk)
        .where(Risk.tenant_id == tenant_id)
    )
    current = result.scalar() or 0
    limit   = settings.MAX_RISKS
    pct     = round((current / limit) * 100, 1) if limit else 0.0
    return RiskQuotaInfo(
        current=current,
        limit=limit,
        pct=pct,
        warn=pct >= settings.RISK_WARNING_THRESHOLD * 100,
        full=current >= limit,
    )


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
        module='Risk',
        record_id=record_id,
        summary=summary,
    ))
    await db.flush()


def _serialize(risk: Risk) -> dict:
    """Convert Risk ORM object to a JSON-safe dict for recycle bin storage."""
    return RiskResponse.model_validate(risk).model_dump(mode='json')


# ── Public API ────────────────────────────────────────────────────────────────

async def list_risks(
    db: AsyncSession,
    tenant_id: UUID,
    page: int = 1,
    page_size: int = 50,
    risk_id: str | None = None,
    category: str | None = None,
    level: str | None = None,
    treatment: str | None = None,
    owner: str | None = None,
    search: str | None = None,
) -> RiskListResponse:
    q = select(Risk).where(Risk.tenant_id == tenant_id)

    if risk_id:
        q = q.where(func.upper(Risk.id) == risk_id.strip().upper())
    if category:
        q = q.where(Risk.category == category)
    if level:
        q = q.where(Risk.level == level)
    if treatment:
        q = q.where(Risk.treatment == treatment)
    if owner:
        q = q.where(Risk.owner == owner)
    if search:
        term = f'%{search.lower()}%'
        q = q.where(
            func.lower(Risk.description).like(term)
            | func.lower(Risk.category).like(term)
            | func.lower(Risk.owner).like(term)
        )

    total_result = await db.execute(
        select(func.count()).select_from(q.subquery())
    )
    total = total_result.scalar() or 0

    rows = await db.execute(
        q.order_by(Risk.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    risks  = rows.scalars().all()
    quota  = await _quota(db, tenant_id)

    return RiskListResponse(
        items=[RiskResponse.model_validate(r) for r in risks],
        total=total,
        page=page,
        page_size=page_size,
        quota=quota,
    )


async def get_risk(
    db: AsyncSession,
    tenant_id: UUID,
    risk_id: str,
) -> RiskResponse:
    result = await db.execute(
        select(Risk)
        .where(Risk.tenant_id == tenant_id)
        .where(Risk.id == risk_id)
    )
    risk = result.scalar_one_or_none()
    if not risk:
        raise ResourceNotFoundError(f'Risk {risk_id} not found')
    return RiskResponse.model_validate(risk)


async def create_risk(
    db: AsyncSession,
    tenant_id: UUID,
    payload: RiskCreate,
    user_email: str,
    cfg: MatrixConfig | None = None,
) -> RiskResponse:
    quota = await _quota(db, tenant_id)
    if quota.full:
        raise QuotaExceededError(
            f'Workspace has reached the {quota.limit} risk limit. '
            'Delete or archive existing risks before adding new ones.'
        )

    resolved_cfg = cfg or await _get_matrix(db, tenant_id)
    scored   = _score(payload.likelihood, payload.impact_score, payload.control_effectiveness, resolved_cfg)
    risk_id  = await _next_id(db, tenant_id)
    now      = datetime.now(timezone.utc)

    risk = Risk(
        id=risk_id,
        tenant_id=tenant_id,
        category=payload.category,
        description=payload.description,
        primary_impact=payload.primary_impact,
        owner=payload.owner,
        owner_email=payload.owner_email,
        logged_at=payload.logged_at or date.today(),
        likelihood=payload.likelihood,
        impact_score=payload.impact_score,
        severity=scored['severity'],
        level=scored['level'],
        level_index=scored['level_index'],
        is_elevated=scored['is_elevated'],   # type: ignore[assignment]
        treatment=payload.treatment,
        controls=payload.controls,
        control_effectiveness=payload.control_effectiveness,
        residual=scored['residual'],
        overall_rating=scored['overall_rating'],
        source=payload.source or 'internal',
        mitigation_plan=payload.mitigation_plan,
        comments=payload.comments,
        ai_insight=payload.ai_insight,
        score_delta=Decimal('0'),
        movement='Stable',
        freshness='Fresh',
        target_date=payload.target_date,
        mitigation_status=payload.mitigation_status or 'Open',
        last_reviewed_at=now,
        control_last_tested=payload.control_last_tested,
        control_test_result=payload.control_test_result or 'Not Tested',
    )
    db.add(risk)
    await db.flush()
    await db.refresh(risk)

    await _audit(db, tenant_id, user_email, 'CREATE', risk_id,
                 f'Created risk: {payload.description} ({payload.category})')

    await log_risk_history(db, tenant_id, risk_id, float(scored['residual']), user_email)

    await log_activity(
        db, tenant_id, risk_id, payload.description,
        'risk_created', None, float(scored['residual']),
        user_email, payload.category, scored['level'],
    )

    return RiskResponse.model_validate(risk)


async def update_risk(
    db: AsyncSession,
    tenant_id: UUID,
    risk_id: str,
    payload: RiskUpdate,
    user_email: str,
) -> RiskResponse:
    result = await db.execute(
        select(Risk)
        .where(Risk.tenant_id == tenant_id)
        .where(Risk.id == risk_id)
    )
    risk = result.scalar_one_or_none()
    if not risk:
        raise ResourceNotFoundError(f'Risk {risk_id} not found')

    prev_residual = float(risk.residual or 0)  # type: ignore[arg-type]

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(risk, field, value)

    cfg    = await _get_matrix(db, tenant_id)
    scored = _score(risk.likelihood, risk.impact_score, risk.control_effectiveness, cfg)  # type: ignore[arg-type]
    risk.severity       = scored['severity']
    risk.level          = scored['level']
    risk.level_index    = scored['level_index']
    risk.is_elevated    = scored['is_elevated']   # type: ignore[assignment]
    risk.residual       = scored['residual']
    risk.overall_rating = scored['overall_rating']

    new_residual       = float(risk.residual)
    delta              = round(new_residual - prev_residual, 2)
    risk.score_delta   = Decimal(str(delta))  # type: ignore[assignment]
    risk.movement      = compute_movement(delta)  # type: ignore[assignment]
    risk.freshness     = compute_freshness(datetime.now(timezone.utc))  # type: ignore[assignment]
    risk.last_reviewed_at = datetime.now(timezone.utc)  # type: ignore[assignment]

    await db.flush()
    await db.refresh(risk)

    await _audit(db, tenant_id, user_email, 'UPDATE', risk_id,
                 f'Updated risk: {risk.description}')

    await log_risk_history(db, tenant_id, risk_id, new_residual, user_email)

    action_type = 'score_change' if delta != 0 else 'risk_updated'
    await log_activity(
        db, tenant_id, risk_id, risk.description or risk_id, # type: ignore[arg-type]
        action_type,
        prev_residual if delta != 0 else None,
        new_residual  if delta != 0 else None,
        user_email, risk.category, risk.level, #type: ignore[arg-type]
    )

    return RiskResponse.model_validate(risk)


async def delete_risk(
    db: AsyncSession,
    tenant_id: UUID,
    risk_id: str,
    user_email: str,
) -> None:
    result = await db.execute(
        select(Risk)
        .where(Risk.tenant_id == tenant_id)
        .where(Risk.id == risk_id)
    )
    risk = result.scalar_one_or_none()
    if not risk:
        raise ResourceNotFoundError(f'Risk {risk_id} not found')

    item_data = _serialize(risk)

    await soft_delete(
        db, tenant_id, 'risk', risk_id, item_data, user_email
    )

    await db.execute(
        delete(Risk)
        .where(Risk.tenant_id == tenant_id)
        .where(Risk.id == risk_id)
    )
    await db.flush()

    await _audit(db, tenant_id, user_email, 'SOFT_DELETE', risk_id,
                 f'Moved to bin: {risk_id}')

    await log_activity(
        db, tenant_id, risk_id, risk.description or risk_id, # type: ignore[arg-type]
        'risk_deleted', float(risk.residual or 0), None, # type: ignore[arg-type]
        user_email, risk.category, risk.level, # type: ignore[arg-type]
    )


async def get_stats(
    db: AsyncSession,
    tenant_id: UUID,
    category:  str | None = None,
    level:     str | None = None,
    treatment: str | None = None,
    owner:     str | None = None,
    search:    str | None = None,
) -> RiskStatsResponse:
    q = (
        select(
            Risk.level,
            Risk.level_index,
            Risk.is_elevated,
            Risk.category,
            Risk.owner,
            Risk.residual,
            Risk.control_effectiveness,
        )
        .where(Risk.tenant_id == tenant_id)
        .where(Risk.deleted_at.is_(None))
    )

    if category:
        q = q.where(Risk.category == category)
    if level:
        q = q.where(Risk.level == level)
    if treatment:
        q = q.where(Risk.treatment == treatment)
    if owner:
        q = q.where(Risk.owner == owner)
    if search:
        term = f'%{search.lower()}%'
        q = q.where(
            func.lower(Risk.description).like(term)
            | func.lower(Risk.category).like(term)
            | func.lower(Risk.owner).like(term)
        )

    result = await db.execute(q)
    rows = result.all()

    total = len(rows)

    # Exposure index: avg residual -> 0-100 pct
    residuals = [float(r.residual) for r in rows if r.residual is not None]
    avg_resid = sum(residuals) / len(residuals) if residuals else 0.0
    exposure_pct = min(100, round((avg_resid / 25) * 100))
    if exposure_pct < 30:
        exposure_label = 'Low'
    elif exposure_pct < 55:
        exposure_label = 'Moderate'
    elif exposure_pct < 75:
        exposure_label = 'High'
    else:
        exposure_label = 'Critical'

    # Risk volume: elevated count (uses pre-computed is_elevated)
    high_critical = sum(1 for r in rows if r.is_elevated)

    # Concentration: top 3 categories by count
    cat_map: dict[str, int] = {}
    for r in rows:
        cat = (r.category or 'Other').strip()
        cat_map[cat] = cat_map.get(cat, 0) + 1
    concentration = [
        ConcentrationItem(name=name, count=count)
        for name, count in sorted(cat_map.items(), key=lambda x: -x[1])[:3]
    ]

    # Top owner by sum of residuals
    owner_map: dict[str, float] = {}
    for r in rows:
        o = (r.owner or '').strip()
        if not o:
            continue
        owner_map[o] = owner_map.get(o, 0.0) + float(r.residual or 0)
    top_owner: TopOwner | None = None
    if owner_map:
        top_name = max(owner_map, key=lambda k: owner_map[k])
        top_owner = TopOwner(name=top_name, score=round(owner_map[top_name], 1))

    # Control signal: avg control_effectiveness %, avg residual
    eff_vals = [float(r.control_effectiveness) for r in rows if r.control_effectiveness is not None]
    avg_eff = round((sum(eff_vals) / len(eff_vals)) * 20) if eff_vals else 0

    if avg_eff >= 70:
        signal_msg   = 'Controls improving — residual trending down'
        signal_class = 'good'
    elif avg_eff >= 50:
        signal_msg   = 'Controls moderate — monitor residual exposure'
        signal_class = 'warn'
    else:
        signal_msg   = 'Controls need attention — high residual'
        signal_class = 'bad'

    return RiskStatsResponse(
        exposure_index=ExposureIndex(pct=exposure_pct, label=exposure_label, total=total),
        risk_volume=RiskVolume(total=total, high_critical=high_critical),
        concentration=concentration,
        top_owner=top_owner,
        control_signal=ControlSignal(
            eff_pct=avg_eff,
            avg_residual=round(avg_resid, 1),
            signal_msg=signal_msg,
            signal_class=signal_class,
        ),
    )


async def bulk_import(
    db: AsyncSession,
    tenant_id: UUID,
    payload: BulkImportRequest,
    user_email: str,
) -> BulkImportResponse:
    quota  = await _quota(db, tenant_id)
    slots  = max(0, quota.limit - quota.current)

    imported   = 0
    skipped    = 0
    duplicates = 0
    errors: list[BulkImportError] = []

    # Fetch existing (description, category, owner) tuples for this tenant
    existing_result = await db.execute(
        select(Risk.description, Risk.category, Risk.owner)
        .where(Risk.tenant_id == tenant_id)
        .where(Risk.deleted_at.is_(None))
    )
    existing: set[tuple[str, str, str]] = {
        (
            str(r.description or "").lower().strip(),
            str(r.category   or "").lower().strip(),
            str(r.owner      or "").lower().strip(),
        )
        for r in existing_result.all()
    }
    seen_in_batch: set[tuple[str, str, str]] = set()

    cfg = await _get_matrix(db, tenant_id)
    for i, row in enumerate(payload.rows):
        key = (
            row.description.lower().strip(),
            row.category.lower().strip(),
            row.owner.lower().strip(),
        )
        if key in existing or key in seen_in_batch:
            duplicates += 1
            continue
        seen_in_batch.add(key)

        if imported >= slots:
            skipped += len(payload.rows) - i
            break
        try:
            create_payload = RiskCreate(
                category=row.category,
                description=row.description,
                owner=row.owner,
                treatment=row.treatment,
                likelihood=row.likelihood,
                impact_score=row.impact_score,
                primary_impact=row.primary_impact,
                controls=row.controls,
                control_effectiveness=row.control_effectiveness,
                mitigation_plan=row.mitigation_plan,
                comments=row.comments,
                logged_at=row.logged_at,
            )
            await create_risk(db, tenant_id, create_payload, user_email, cfg)
            imported += 1
        except QuotaExceededError:
            skipped += len(payload.rows) - i
            break
        except Exception as e:
            errors.append(BulkImportError(row=i + 1, reason=str(e)))

    return BulkImportResponse(
        imported=imported, skipped=skipped, duplicates=duplicates, errors=errors
    )