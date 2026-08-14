# app/services/matrix_config.py

import uuid
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.matrix_config import MatrixConfig
from app.schemas.matrix_config import MatrixConfigResponse, MatrixConfigUpdate
from app.core.exceptions import ValidationError


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


async def _get_or_create(db: AsyncSession, tenant_id: UUID) -> MatrixConfig:
    result = await db.execute(
        select(MatrixConfig).where(MatrixConfig.tenant_id == tenant_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = MatrixConfig(id=uuid.uuid4(), tenant_id=tenant_id, **_DEFAULTS)
        db.add(row)
        await db.flush()
        await db.refresh(row)
    return row


async def get_config(db: AsyncSession, tenant_id: UUID) -> MatrixConfigResponse:
    row = await _get_or_create(db, tenant_id)
    return MatrixConfigResponse.model_validate(row)


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
    return MatrixConfigResponse.model_validate(row)