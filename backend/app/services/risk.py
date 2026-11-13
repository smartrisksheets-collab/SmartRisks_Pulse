# app/services/risk.py

import logging
from typing import Any
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Select, select, delete, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.risk import Risk
from app.models.audit_log import AuditLog
from app.models.incident import Incident
from app.schemas.risk import (
    RiskCreate, RiskUpdate, RiskResponse,
    RiskListResponse, RiskQuotaInfo,
    BulkImportRequest, BulkImportResponse, BulkImportError,
    RiskStatsResponse, ConcentrationItem, TopOwner,
    ExposureIndex, RiskVolume, ControlSignal,
    RiskViewCounts, ScorePreviewRequest, ScoreBreakdown,
    RiskContext, RiskHistoryItem, RiskLinkedIncident,
)
from app.core.config import settings
from app.core.exceptions import ResourceNotFoundError, QuotaExceededError
from app.models.appetite_threshold import AppetiteThreshold
from app.models.matrix_config import MatrixConfig
from app.services.matrix_config import _get_or_create as _get_matrix
from app.services.phase_one import (
    compute_movement, compute_freshness,
    log_risk_history, log_activity,
)
from app.services.recycle import soft_delete
from app.services.risk_status import (
    APPETITE_NEAR_RATIO, ce_fraction, ce_avg_pct, resolve_ce_input, appetite_status, threshold_for,
    band_count, band_for_score, is_elevated_index,
    OPEN_MITIGATION, ce_label, elevated_phrase, is_past_target, is_undecided, residual_max,
)

logger = logging.getLogger(__name__)

# ── Private helpers ───────────────────────────────────────────────────────────

def _score(
    likelihood: int,
    impact_score: int,
    control_effectiveness: int | None,
    cfg: MatrixConfig | None = None,
) -> dict:
    ce_scale = int(cfg.ce_scale) if cfg is not None else 5  # type: ignore[arg-type]
    ce       = ce_fraction(control_effectiveness, ce_scale) or 0.0
    severity = likelihood * impact_score
    residual = round(severity * (1 - ce), 2)

    level_index, level = band_for_score(severity, cfg)
    is_elevated = is_elevated_index(level_index, band_count(cfg))

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
    data = RiskResponse.model_validate(risk).model_dump(mode='json', exclude={'appetite_status'})
    lda = risk.linked_decision_at
    sid = risk.source_submission_id
    data['linked_decision_at']   = str(lda) if lda is not None else None
    data['source_submission_id'] = str(sid) if sid is not None else None
    return data

def _apply_risk_filters(
    q: Select[Any],
    tenant_id: UUID,
    *,
    risk_id: str | None = None,
    category: str | None = None,
    level: str | None = None,
    treatment: str | None = None,
    owner: str | None = None,
    search: str | None = None,
    undecided: bool | None = None,
    appetite: str | None = None,
    elevated: bool | None = None,
    past_target: bool | None = None,
    today: date | None = None,
) -> Select[Any]:
    """Register filters shared by list_risks and get_stats, so the table and stat cards always agree."""
    if risk_id:
        q = q.where(func.upper(Risk.id).like(f"{risk_id.strip().upper()}%"))
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
            | func.lower(Risk.id).like(term)
            | func.lower(func.coalesce(Risk.title, '')).like(term)
            | func.lower(func.coalesce(Risk.primary_impact, '')).like(term)
        )
    if elevated is True:
        q = q.where(Risk.is_elevated.is_(True))
    if past_target is True:
        # Same rule as risk_status.is_past_target.
        q = q.where(
            Risk.target_date.isnot(None),
            Risk.target_date < (today or date.today()),
            func.coalesce(Risk.mitigation_status, 'Open').in_(sorted(OPEN_MITIGATION)),
        )
    if undecided is True:
        # Same rule as risk_status.is_undecided: elevated or over appetite,
        # no linked decision, not marked Accepted.
        threshold = (
            select(AppetiteThreshold.threshold)
            .where(
                AppetiteThreshold.tenant_id == tenant_id,
                AppetiteThreshold.category == Risk.category,
            )
            .limit(1)
            .scalar_subquery()
        )
        q = q.where(
            func.coalesce(func.trim(Risk.linked_decision), '') == '',
            func.coalesce(Risk.mitigation_status, '') != 'Accepted',
            Risk.is_elevated.is_(True) | (Risk.residual > threshold),
        )

    if appetite:
        q = q.outerjoin(
            AppetiteThreshold,
            (AppetiteThreshold.category == Risk.category)
            & (AppetiteThreshold.tenant_id == tenant_id),
        )
        near = AppetiteThreshold.threshold * APPETITE_NEAR_RATIO
        if appetite == "Exceeds":
            q = q.where(AppetiteThreshold.threshold.isnot(None), Risk.residual > AppetiteThreshold.threshold)
        elif appetite == "Near":
            q = q.where(
                AppetiteThreshold.threshold.isnot(None),
                Risk.residual > near,
                Risk.residual <= AppetiteThreshold.threshold,
            )
        elif appetite == "Within":
            q = q.where(AppetiteThreshold.threshold.isnot(None), Risk.residual <= near)
        elif appetite == "unset":
            q = q.where(AppetiteThreshold.threshold.is_(None))
    return q


async def _thresholds(db: AsyncSession, tenant_id: UUID) -> dict[str, float]:
    """The workspace's appetite thresholds by category."""
    return {
        str(t.category): float(t.threshold)  # type: ignore[arg-type]
        for t in (await db.execute(
            select(AppetiteThreshold.category, AppetiteThreshold.threshold)
            .where(AppetiteThreshold.tenant_id == tenant_id)
        )).all()
        if t.category is not None and t.threshold is not None
    }


def _with_status(r: Risk, thresholds: dict[str, float], today: date) -> RiskResponse:
    """RiskResponse plus the statuses every register surface shows, from risk_status rules."""
    item = RiskResponse.model_validate(r)
    item.appetite_status = appetite_status(
        float(r.residual) if r.residual is not None else None,  # type: ignore[arg-type]
        threshold_for(str(r.category) if r.category is not None else None, thresholds),
    )
    item.is_undecided = is_undecided(
        is_elevated=bool(r.is_elevated),
        appetite=item.appetite_status,
        linked_decision=str(r.linked_decision) if r.linked_decision is not None else None,
        mitigation_status=str(r.mitigation_status) if r.mitigation_status is not None else None,
    )
    item.is_past_target = is_past_target(
        target_date=r.target_date,  # type: ignore[arg-type]
        mitigation_status=str(r.mitigation_status) if r.mitigation_status is not None else None,
        today=today,
    )
    return item


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
    undecided: bool | None = None,
    appetite: str | None = None,
    elevated: bool | None = None,
    past_target: bool | None = None,
    sort: str | None = None,
) -> RiskListResponse:
    q = _apply_risk_filters(
        select(Risk).where(Risk.tenant_id == tenant_id), tenant_id,
        risk_id=risk_id, category=category, level=level, treatment=treatment,
        owner=owner, search=search, undecided=undecided, appetite=appetite,
        elevated=elevated, past_target=past_target,
    )

    total_result = await db.execute(
        select(func.count()).select_from(q.subquery())
    )
    total = total_result.scalar() or 0

    if sort == 'residual':
        order = (Risk.residual.desc().nulls_last(), Risk.id.asc())
    else:
        order = (Risk.created_at.desc(), Risk.id.asc())
    rows = await db.execute(
        q.order_by(*order)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    risks  = rows.scalars().all()
    quota  = await _quota(db, tenant_id)

    thresholds = await _thresholds(db, tenant_id)
    today = date.today()
    items = [_with_status(r, thresholds, today) for r in risks]

    return RiskListResponse(
        items=items,
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
    return _with_status(risk, await _thresholds(db, tenant_id), date.today())


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

    resolved_cfg = cfg or await _get_matrix(db, tenant_id, lock_share=True)
    scored   = _score(payload.likelihood, payload.impact_score, payload.control_effectiveness, resolved_cfg)
    risk_id  = await _next_id(db, tenant_id)
    now      = datetime.now(timezone.utc)

    risk = Risk(
        id=risk_id,
        tenant_id=tenant_id,
        title=payload.title,
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
        control_assertion_source=payload.control_assertion_source,
        root_cause=payload.root_cause,
        financial_exposure=payload.financial_exposure,
        linked_decision=payload.linked_decision,
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

    cfg = await _get_matrix(db, tenant_id, lock_share=True)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(risk, field, value)

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
    risk_id:   str | None = None,
    undecided: bool | None = None,
    appetite:  str | None = None,
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
    q = _apply_risk_filters(
        q, tenant_id,
        risk_id=risk_id, category=category, level=level, treatment=treatment,
        owner=owner, search=search, undecided=undecided, appetite=appetite,
    )

    result = await db.execute(q)
    rows = result.all()

    total = len(rows)

    # Exposure index: avg residual -> 0-100 pct, denominator from matrix config
    _mc      = await _get_matrix(db, tenant_id)
    _l_scale = int(_mc.likelihood_scale) if _mc else 5  # type: ignore[arg-type]
    _i_scale = int(_mc.impact_scale)     if _mc else 5  # type: ignore[arg-type]
    _res_max = _l_scale * _i_scale
    residuals = [float(r.residual) for r in rows if r.residual is not None]
    avg_resid = sum(residuals) / len(residuals) if residuals else 0.0
    exposure_pct = min(100, round((avg_resid / _res_max) * 100))
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
    _ce_scale = int(_mc.ce_scale) if _mc else 5  # type: ignore[arg-type]
    avg_eff = round(ce_avg_pct(sum(eff_vals) / len(eff_vals), _ce_scale)) if eff_vals else 0

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
            residual_max=_res_max,
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

    cfg = await _get_matrix(db, tenant_id, lock_share=True)
    ce_scale_i  = int(cfg.ce_scale)        # type: ignore[arg-type]
    ce_labels_i = dict(cfg.ce_labels)      # type: ignore[arg-type]
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
                title=row.title,
                category=row.category,
                description=row.description,
                owner=row.owner,
                treatment=row.treatment,
                likelihood=row.likelihood,
                impact_score=row.impact_score,
                primary_impact=row.primary_impact,
                controls=row.controls,
                control_effectiveness=resolve_ce_input(row.control_effectiveness, ce_scale_i, ce_labels_i),
                mitigation_plan=row.mitigation_plan,
                comments=row.comments,
                logged_at=row.logged_at,
                owner_email=row.owner_email,
                target_date=row.target_date,
                mitigation_status=row.mitigation_status,
                control_last_tested=row.control_last_tested,
                control_test_result=row.control_test_result,
                control_assertion_source=row.control_assertion_source,
                root_cause=row.root_cause,
                financial_exposure=row.financial_exposure,
                linked_decision=row.linked_decision,
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

# ── Register views, score preview and risk context (UI step 5) ────────────────

HISTORY_LIMIT = 10
LINKED_INCIDENT_LIMIT = 20


def _fmt(v: float) -> str:
    return str(int(v + 0.5))


def score_note(residual: float, category: str | None, threshold: float | None, status: str | None) -> str:
    """One sentence on where a residual sits against its category's appetite. Used by preview and panel."""
    cat = (category or '').strip()
    if not cat:
        return 'Choose a category to check this risk against appetite.'
    if threshold is None or status is None:
        return (f'No appetite threshold is set for {cat}, so this risk cannot be checked '
                'against appetite. Set one in Settings.')
    if status == 'exceeds':
        return (f'Residual {_fmt(residual)} is above the {cat} threshold of {_fmt(threshold)}. '
                'Bring it back inside, or have a revised threshold approved.')
    if status == 'near':
        return (f'Residual {_fmt(residual)} is close to the {cat} threshold of {_fmt(threshold)}. '
                'Stronger controls would give more room.')
    return f'Residual {_fmt(residual)} is inside the {cat} threshold of {_fmt(threshold)}.'


def _breakdown(
    *,
    severity: float,
    residual: float,
    level: str,
    level_index: int,
    elevated: bool,
    ce_level: int | None,
    category: str | None,
    cfg: MatrixConfig,
    thresholds: dict[str, float],
) -> ScoreBreakdown:
    scale  = int(cfg.ce_scale)  # type: ignore[arg-type]
    labels = dict(cfg.ce_labels)  # type: ignore[arg-type]
    frac   = ce_fraction(ce_level, scale) or 0.0
    threshold = threshold_for(category, thresholds)
    status    = appetite_status(residual, threshold)
    return ScoreBreakdown(
        severity=severity,
        level=level,
        level_index=level_index,
        is_elevated=elevated,
        residual=residual,
        residual_max=residual_max(cfg),
        ce_level=ce_level,
        ce_scale=scale,
        ce_label=ce_label(ce_level, labels),
        ce_pct=round(frac * 100),
        threshold=threshold,
        appetite_status=status,
        note=score_note(residual, category, threshold, status),
    )


async def score_preview(db: AsyncSession, tenant_id: UUID, payload: ScorePreviewRequest) -> ScoreBreakdown:
    """Score unsaved form values with the same _score used on save. Writes nothing."""
    cfg = await _get_matrix(db, tenant_id)
    scale = int(cfg.ce_scale)  # type: ignore[arg-type]
    if payload.control_effectiveness is not None and payload.control_effectiveness > scale:
        raise ValueError(f'Control effectiveness {payload.control_effectiveness} is outside 0 to {scale}.')
    scored = _score(payload.likelihood, payload.impact_score, payload.control_effectiveness, cfg)
    return _breakdown(
        severity=float(scored['severity']),
        residual=float(scored['residual']),
        level=str(scored['level']),
        level_index=int(scored['level_index']),
        elevated=bool(scored['is_elevated']),
        ce_level=payload.control_effectiveness,
        category=(payload.category or '').strip() or None,
        cfg=cfg,
        thresholds=await _thresholds(db, tenant_id),
    )


async def get_view_counts(
    db: AsyncSession,
    tenant_id: UUID,
    *,
    category: str | None = None,
    level: str | None = None,
    owner: str | None = None,
    search: str | None = None,
) -> RiskViewCounts:
    """Counts for the register quick views. Each count applies the same dropdown filters as the table."""
    base: dict[str, Any] = dict(category=category, level=level, owner=owner, search=search)
    today = date.today()

    async def _count(**extra: Any) -> int:
        q = _apply_risk_filters(
            select(Risk.id).where(Risk.tenant_id == tenant_id), tenant_id, today=today, **base, **extra,
        )
        return int((await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0)

    avg_q = _apply_risk_filters(
        select(Risk.residual).where(Risk.tenant_id == tenant_id), tenant_id, today=today, **base,
    ).subquery()
    avg = (await db.execute(select(func.avg(avg_q.c.residual)))).scalar()
    cfg = await _get_matrix(db, tenant_id)

    return RiskViewCounts(
        all=await _count(),
        exceeds=await _count(appetite='Exceeds'),
        elevated=await _count(elevated=True),
        undecided=await _count(undecided=True),
        past_target=await _count(past_target=True),
        elevated_label=elevated_phrase(cfg),
        avg_residual=round(float(avg), 1) if avg is not None else None,
        residual_max=residual_max(cfg),
    )


async def get_risk_context(
    db: AsyncSession,
    tenant_id: UUID,
    risk_id: str,
    *,
    include_incidents: bool,
) -> RiskContext:
    """What the register side panel shows beyond the risk row: score breakdown, history, linked incidents."""
    risk = (await db.execute(
        select(Risk).where(Risk.tenant_id == tenant_id, Risk.id == risk_id)
    )).scalar_one_or_none()
    if risk is None:
        raise ResourceNotFoundError(f'Risk {risk_id} not found')

    cfg = await _get_matrix(db, tenant_id)
    severity = float(risk.severity) if risk.severity is not None else 0.0  # type: ignore[arg-type]
    residual = float(risk.residual) if risk.residual is not None else 0.0  # type: ignore[arg-type]
    if risk.level_index is not None:
        level_index, level = int(risk.level_index), str(risk.level or '')  # type: ignore[arg-type]
    else:
        level_index, level = band_for_score(severity, cfg)
    score = _breakdown(
        severity=severity,
        residual=residual,
        level=level,
        level_index=level_index,
        elevated=bool(risk.is_elevated),
        ce_level=int(risk.control_effectiveness) if risk.control_effectiveness is not None else None,  # type: ignore[arg-type]
        category=str(risk.category) if risk.category is not None else None,
        cfg=cfg,
        thresholds=await _thresholds(db, tenant_id),
    )

    audit_rows = (await db.execute(
        select(AuditLog.created_at, AuditLog.user_email, AuditLog.action, AuditLog.summary)
        .where(
            AuditLog.tenant_id == tenant_id,
            AuditLog.module == 'Risk',
            AuditLog.record_id == risk_id,
        )
        .order_by(AuditLog.created_at.desc())
        .limit(HISTORY_LIMIT)
    )).all()
    history = [
        RiskHistoryItem(at=a.created_at, user=a.user_email, action=a.action, summary=a.summary)
        for a in audit_rows
    ]

    incidents: list[RiskLinkedIncident] = []
    if include_incidents:
        inc_rows = (await db.execute(
            select(Incident.id, Incident.title, Incident.severity, Incident.status, Incident.reported_at)
            .where(
                Incident.tenant_id == tenant_id,
                Incident.linked_risk_id == risk_id,
                Incident.deleted_at.is_(None),
            )
            .order_by(Incident.reported_at.desc().nulls_last(), Incident.id.desc())
            .limit(LINKED_INCIDENT_LIMIT)
        )).all()
        incidents = [
            RiskLinkedIncident(
                id=str(i.id), title=i.title, severity=i.severity, status=i.status, reported_at=i.reported_at,
            )
            for i in inc_rows
        ]

    return RiskContext(score=score, history=history, incidents=incidents)
