# app/services/matrix_config.py

import uuid
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.matrix_config import MatrixConfig
from app.schemas.matrix_config import (
    MatrixConfigResponse, MatrixConfigUpdate, CeConfigUpdate, CeScalePreview, CeOption, CeBlockedRisk,
)
from app.core.exceptions import ValidationError
from app.services.phase_one import log_activity
from app.services.risk_status import CE_SCALES, ce_label

CE_SCALE_SWITCH_ENABLED = True


_DEFAULTS = dict(
    likelihood_scale=5,   impact_scale=5,
    band_count=4,
    band_1_label='Low',   band_2_label='Medium',
    band_3_label='High',  band_4_label='Critical',
    band_5_label='Extreme',
    band_low_min=1,       band_low_max=4,
    band_medium_min=5,    band_medium_max=9,
    band_high_min=10,     band_high_max=16,
    band_critical_min=17, band_critical_max=25,
    band_extreme_min=21,  band_extreme_max=25,
)


async def _get_or_create(
    db: AsyncSession,
    tenant_id: UUID,
    *,
    lock_update: bool = False,
    lock_share: bool = False,
) -> MatrixConfig:
    stmt = select(MatrixConfig).where(MatrixConfig.tenant_id == tenant_id)
    if lock_update:
        stmt = stmt.with_for_update()
    elif lock_share:
        stmt = stmt.with_for_update(read=True)
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        row = MatrixConfig(id=uuid.uuid4(), tenant_id=tenant_id, **_DEFAULTS)
        db.add(row)
        await db.flush()
        await db.refresh(row)
    return row


async def get_config(db: AsyncSession, tenant_id: UUID) -> MatrixConfigResponse:
    row = await _get_or_create(db, tenant_id)
    return _to_response(row)


def _ce_option_label(level: int, labels: dict[str, str]) -> str:
    name = ce_label(level, labels)
    return name if name == str(level) else f'{level} – {name}'


def _to_response(row: MatrixConfig) -> MatrixConfigResponse:
    resp = MatrixConfigResponse.model_validate(row)
    labels = dict(resp.ce_labels)
    options = [CeOption(value=None, label='Not assessed')] + [
        CeOption(value=i, label=_ce_option_label(i, labels)) for i in range(resp.ce_scale + 1)
    ]
    return resp.model_copy(update={'ce_scale_switch_enabled': CE_SCALE_SWITCH_ENABLED, 'ce_options': options})


async def update_config(
    db: AsyncSession,
    tenant_id: UUID,
    payload: MatrixConfigUpdate,
) -> MatrixConfigResponse:
    # Block if existing risks use scores outside new scale
    conflict_result = await db.execute(
        text("""
            SELECT COUNT(*) FROM risks
            WHERE tenant_id = :tid
              AND deleted_at IS NULL
              AND (likelihood > :lscale OR impact_score > :iscale)
        """),
        {
            'tid':    str(tenant_id),
            'lscale': payload.likelihood_scale,
            'iscale': payload.impact_scale,
        },
    )
    conflict_count = conflict_result.scalar() or 0
    if conflict_count > 0:
        raise ValidationError(
            f'{conflict_count} risk(s) have likelihood or impact scores above '
            f'the new {payload.likelihood_scale}x{payload.impact_scale} scale. '
            'Update or remove those risks before changing matrix dimensions.'
        )

    new_max = payload.likelihood_scale * payload.impact_scale
    threshold_result = await db.execute(
        text("""
            SELECT COUNT(*) FROM appetite_thresholds
            WHERE tenant_id = :tid AND threshold > :new_max
        """),
        {'tid': str(tenant_id), 'new_max': new_max},
    )
    threshold_conflicts = threshold_result.scalar() or 0
    if threshold_conflicts > 0:
        raise ValidationError(
            f'{threshold_conflicts} appetite threshold(s) are above {new_max}, the highest residual '
            f'score on a {payload.likelihood_scale}x{payload.impact_scale} matrix. '
            'Lower those thresholds before changing matrix dimensions.'
        )

    row = await _get_or_create(db, tenant_id)
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    await db.flush()

    # Bulk re-classify all active risks under new band thresholds + labels
    bc = payload.band_count
    elevated_threshold = max(bc - 1, 2)

    await db.execute(
        text("""
            UPDATE risks SET
              level = CASE
                WHEN :bc >= 5 AND likelihood * impact_score >= :ext_min  THEN :label_5
                WHEN :bc >= 4 AND likelihood * impact_score >= :crit_min THEN :label_4
                WHEN :bc >= 3 AND likelihood * impact_score >= :high_min  THEN :label_3
                WHEN :bc >= 2 AND likelihood * impact_score >= :med_min   THEN :label_2
                ELSE :label_1
              END,
              level_index = CASE
                WHEN :bc >= 5 AND likelihood * impact_score >= :ext_min  THEN 5
                WHEN :bc >= 4 AND likelihood * impact_score >= :crit_min THEN 4
                WHEN :bc >= 3 AND likelihood * impact_score >= :high_min  THEN 3
                WHEN :bc >= 2 AND likelihood * impact_score >= :med_min   THEN 2
                ELSE 1
              END,
              is_elevated = (
                (:bc >= 5 AND likelihood * impact_score >= :crit_min) OR
                (:bc = 4  AND likelihood * impact_score >= :high_min)  OR
                (:bc < 4  AND likelihood * impact_score >= :med_min)
              )
            WHERE tenant_id = :tid AND deleted_at IS NULL
        """),
        {
            'tid':      str(tenant_id),
            'bc':       bc,
            'ext_min':  payload.band_extreme_min,
            'crit_min': payload.band_critical_min,
            'high_min': payload.band_high_min,
            'med_min':  payload.band_medium_min,
            'label_1':  payload.band_1_label,
            'label_2':  payload.band_2_label,
            'label_3':  payload.band_3_label,
            'label_4':  payload.band_4_label,
            'label_5':  payload.band_5_label,
        },
    )

    await db.refresh(row)
    return _to_response(row)


async def _ce_counts(db: AsyncSession, tenant_id: UUID, target_scale: int) -> tuple[int, int]:
    result = await db.execute(
        text("""
            SELECT
              COUNT(*) FILTER (WHERE control_effectiveness > 0)       AS affected,
              COUNT(*) FILTER (WHERE control_effectiveness > :target) AS blocked
            FROM risks
            WHERE tenant_id = :tid AND deleted_at IS NULL
        """),
        {'tid': str(tenant_id), 'target': target_scale},
    )
    counts = result.one()
    return int(counts.affected or 0), int(counts.blocked or 0)


_BLOCKED_LIST_LIMIT = 20


async def _blocked_risks(db: AsyncSession, tenant_id: UUID, target_scale: int) -> list[CeBlockedRisk]:
    result = await db.execute(
        text("""
            SELECT id, description, control_effectiveness
            FROM risks
            WHERE tenant_id = :tid AND deleted_at IS NULL AND control_effectiveness > :target
            ORDER BY id
            LIMIT :lim
        """),
        {'tid': str(tenant_id), 'target': target_scale, 'lim': _BLOCKED_LIST_LIMIT},
    )
    return [
        CeBlockedRisk(
            risk_id=str(r.id),
            description=str(r.description or ''),
            control_effectiveness=int(r.control_effectiveness),
        )
        for r in result.all()
    ]


async def preview_ce_scale(db: AsyncSession, tenant_id: UUID, target_scale: int) -> CeScalePreview:
    if target_scale not in CE_SCALES:
        raise ValidationError('Control effectiveness scale must be 4 or 5.')
    row = await _get_or_create(db, tenant_id)
    current = int(row.ce_scale)  # type: ignore[arg-type]
    affected, blocked = await _ce_counts(db, tenant_id, target_scale)
    return CeScalePreview(
        current_scale=current,
        target_scale=target_scale,
        affected_count=affected if target_scale != current else 0,
        blocked_count=blocked,
        blocked_risks=await _blocked_risks(db, tenant_id, target_scale) if blocked > 0 else [],
    )


async def update_ce_config(
    db: AsyncSession,
    tenant_id: UUID,
    payload: CeConfigUpdate,
    user_email: str,
) -> MatrixConfigResponse:
    row = await _get_or_create(db, tenant_id, lock_update=True)
    old_scale = int(row.ce_scale)  # type: ignore[arg-type]
    new_scale = payload.ce_scale
    switching = new_scale != old_scale
    affected = 0

    if switching:
        if not CE_SCALE_SWITCH_ENABLED:
            raise ValidationError('Changing the control effectiveness scale is not available yet.')
        if not payload.confirm:
            raise ValidationError('Confirm the scale change before saving.')
        affected, blocked = await _ce_counts(db, tenant_id, new_scale)
        if blocked > 0:
            ids = ', '.join(r.risk_id for r in await _blocked_risks(db, tenant_id, new_scale))
            more = f' and {blocked - _BLOCKED_LIST_LIMIT} more' if blocked > _BLOCKED_LIST_LIMIT else ''
            raise ValidationError(
                f'{blocked} risk(s) are rated above {new_scale} ({ids}{more}). '
                f'Re-rate them before switching to a {new_scale}-level scale.'
            )

    row.ce_scale = new_scale          # type: ignore[assignment]
    row.ce_labels = payload.ce_labels  # type: ignore[assignment]
    await db.flush()

    if switching:
        params = {'tid': str(tenant_id), 'scale': new_scale, 'email': user_email}
        await db.execute(
            text("""
                UPDATE risks SET
                  residual       = ROUND(severity * (1 - control_effectiveness::numeric / :scale), 2),
                  overall_rating = ROUND(severity * (1 - control_effectiveness::numeric / :scale), 2)
                WHERE tenant_id = :tid AND deleted_at IS NULL AND control_effectiveness > 0
            """),
            params,
        )
        await db.execute(
            text("""
                INSERT INTO risk_history (id, tenant_id, risk_id, residual_score, changed_by, source)
                SELECT gen_random_uuid(), tenant_id, id, residual, :email, 'scale_switch'
                FROM risks
                WHERE tenant_id = :tid AND deleted_at IS NULL AND control_effectiveness > 0
            """),
            params,
        )

    db.add(AuditLog(
        tenant_id=tenant_id,
        user_email=user_email,
        action='CE_SCALE_CHANGE' if switching else 'CE_LABELS_UPDATE',
        module='Settings',
        record_id=str(row.id),
        summary=(
            f'Control effectiveness scale changed from {old_scale} to {new_scale}; '
            f'residual recalculated for {affected} risk(s).'
            if switching else 'Control effectiveness labels updated.'
        ),
    ))
    await db.flush()

    if switching:
        await log_activity(
            db, tenant_id, '', 'Control effectiveness scale', 'ce_scale_change',
            float(old_scale), float(new_scale), user_email,
        )

    await db.refresh(row)
    return _to_response(row)