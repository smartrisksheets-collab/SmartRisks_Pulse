# app/services/appetite.py

from uuid import UUID

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.models.appetite_threshold import AppetiteThreshold
from app.schemas.appetite import AppetiteThresholdResponse, AppetiteThresholdUpsert
from app.services.matrix_config import get_config as get_matrix_config


async def list_appetites(
    db: AsyncSession,
    tenant_id: UUID,
) -> list[AppetiteThresholdResponse]:
    result = await db.execute(
        select(AppetiteThreshold)
        .where(AppetiteThreshold.tenant_id == tenant_id)
        .order_by(AppetiteThreshold.category)
    )
    rows = result.scalars().all()
    return [AppetiteThresholdResponse.model_validate(r) for r in rows]


async def upsert_appetite(
    db: AsyncSession,
    tenant_id: UUID,
    payload: AppetiteThresholdUpsert,
    user_email: str,
) -> AppetiteThresholdResponse:
    matrix = await get_matrix_config(db, tenant_id)
    max_score = int(matrix.likelihood_scale) * int(matrix.impact_scale)
    if payload.threshold > max_score:
        raise ValidationError(
            f'Threshold {payload.threshold} is above {max_score}, the highest residual score '
            f'possible on this workspace\'s {matrix.likelihood_scale}x{matrix.impact_scale} matrix.'
        )

    result = await db.execute(
        select(AppetiteThreshold).where(
            AppetiteThreshold.tenant_id == tenant_id,
            AppetiteThreshold.category == payload.category,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = AppetiteThreshold(
            tenant_id=tenant_id,
            category=payload.category,
            threshold=payload.threshold,
            rationale=payload.rationale,
            set_by=user_email,
        )
        db.add(row)
    else:
        row.threshold = payload.threshold  # type: ignore[assignment]
        row.rationale = payload.rationale  # type: ignore[assignment]
        row.set_by = user_email            # type: ignore[assignment]
    await db.flush()
    await db.refresh(row)
    return AppetiteThresholdResponse.model_validate(row)


async def delete_appetite(
    db: AsyncSession,
    tenant_id: UUID,
    category: str,
) -> bool:
    result = await db.execute(
        delete(AppetiteThreshold).where(
            AppetiteThreshold.tenant_id == tenant_id,
            AppetiteThreshold.category == category,
        )
    )
    await db.flush()
    return result.rowcount > 0  # type: ignore[union-attr]