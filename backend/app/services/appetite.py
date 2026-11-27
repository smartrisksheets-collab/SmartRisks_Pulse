# app/services/appetite.py

from uuid import UUID

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.models.appetite_threshold import AppetiteThreshold
from app.models.audit_log import AuditLog
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
    old_threshold = int(row.threshold) if row is not None else None  # type: ignore[arg-type]
    old_rationale = str(row.rationale or "") if row is not None else ""
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

    # Every appetite change is kept in the Audit Log, with the old and new value.
    new_threshold = int(payload.threshold)
    if old_threshold is None:
        action, summary = "APPETITE_SET", f"Appetite for {payload.category} set to {new_threshold}"
    elif old_threshold != new_threshold:
        action, summary = "APPETITE_UPDATE", f"Appetite for {payload.category} changed from {old_threshold} to {new_threshold}"
    else:
        action, summary = "APPETITE_UPDATE", f"Appetite for {payload.category} kept at {new_threshold}"
    if old_threshold is not None and old_rationale != str(payload.rationale or ""):
        summary += "; rationale updated"
    db.add(AuditLog(
        tenant_id=tenant_id,
        user_email=user_email,
        action=action,
        module="Settings",
        record_id=payload.category,
        summary=summary,
    ))
    await db.flush()
    return AppetiteThresholdResponse.model_validate(row)


async def delete_appetite(
    db: AsyncSession,
    tenant_id: UUID,
    category: str,
    user_email: str,
) -> bool:
    old = (await db.execute(
        select(AppetiteThreshold.threshold).where(
            AppetiteThreshold.tenant_id == tenant_id,
            AppetiteThreshold.category == category,
        )
    )).scalar_one_or_none()
    if old is None:
        return False
    await db.execute(
        delete(AppetiteThreshold).where(
            AppetiteThreshold.tenant_id == tenant_id,
            AppetiteThreshold.category == category,
        )
    )
    db.add(AuditLog(
        tenant_id=tenant_id,
        user_email=user_email,
        action="APPETITE_DELETE",
        module="Settings",
        record_id=category,
        summary=f"Appetite for {category} removed (was {int(old)})",
    ))
    await db.flush()
    return True