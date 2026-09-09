from datetime import date
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.payment import Payment
from app.models.tenant import Tenant
from app.schemas.admin import PaymentCreate, PaymentOut, PaymentUpdate
from app.core.exceptions import PermissionDeniedError, ResourceNotFoundError


async def list_payments(db: AsyncSession, tenant_id: UUID) -> list[PaymentOut]:
    rows = (await db.execute(
        select(Payment)
        .where(Payment.tenant_id == tenant_id)
        .order_by(Payment.paid_at.desc())
    )).scalars().all()
    return [_out(r) for r in rows]


def _add_12_months(d: date) -> date:
    try:
        return d.replace(year=d.year + 1)
    except ValueError:
        # handles Feb 29 on non-leap year
        return d.replace(year=d.year + 1, day=28)


async def create_payment(
    db: AsyncSession,
    tenant_id: UUID,
    payload: PaymentCreate,
    admin_name: str,
) -> PaymentOut:
    tenant = (await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )).scalar_one_or_none()

    if tenant is None:
        raise ResourceNotFoundError("Workspace not found.")

    if str(tenant.status or "").upper() == "SUSPENDED":
        raise PermissionDeniedError("Cannot record a payment for a suspended workspace.")

    paid_at = date.fromisoformat(payload.paid_at)
    expires_at = _add_12_months(paid_at)

    record = Payment(
        tenant_id=tenant_id,
        amount=payload.amount,
        currency=payload.currency,
        method=payload.method,
        reference=payload.reference,
        notes=payload.notes,
        paid_at=paid_at,
        recorded_by=admin_name,
    )
    db.add(record)

    tenant.payment_active = True  # type: ignore[assignment]
    tenant.payment_date = paid_at  # type: ignore[assignment]
    tenant.plan_expires_at = expires_at  # type: ignore[assignment]
    tenant.plan = "PAID"  # type: ignore[assignment]

    await db.flush()
    await db.refresh(record)
    return _out(record)


async def update_payment(
    db: AsyncSession,
    tenant_id: UUID,
    payment_id: UUID,
    payload: PaymentUpdate,
) -> PaymentOut:

    record = (await db.execute(
        select(Payment).where(
            Payment.id == payment_id,
            Payment.tenant_id == tenant_id,
        )
    )).scalar_one_or_none()

    if record is None:
        raise ResourceNotFoundError("Payment not found.")

    if payload.amount is not None:
        record.amount = payload.amount  # type: ignore[assignment]
    if payload.currency is not None:
        record.currency = payload.currency  # type: ignore[assignment]
    if payload.method is not None:
        record.method = payload.method  # type: ignore[assignment]
    if payload.reference is not None:
        record.reference = payload.reference  # type: ignore[assignment]
    if payload.notes is not None:
        record.notes = payload.notes  # type: ignore[assignment]

    if payload.paid_at is not None:
        new_paid_at = date.fromisoformat(payload.paid_at)
        record.paid_at = new_paid_at  # type: ignore[assignment]
        new_expires = _add_12_months(new_paid_at)

        tenant = (await db.execute(
            select(Tenant).where(Tenant.id == tenant_id)
        )).scalar_one_or_none()

        if tenant is not None:
            tenant.payment_date = new_paid_at  # type: ignore[assignment]
            tenant.plan_expires_at = new_expires  # type: ignore[assignment]

    await db.flush()
    await db.refresh(record)
    return _out(record)


def _out(r: Payment) -> PaymentOut:
    return PaymentOut(
        id=str(r.id),
        tenant_id=str(r.tenant_id),
        amount=float(r.amount),  # type: ignore[arg-type]
        currency=str(r.currency or "USD"),
        method=str(r.method) if r.method is not None else None,
        reference=str(r.reference) if r.reference is not None else None,
        notes=str(r.notes) if r.notes is not None else None,
        paid_at=r.paid_at.isoformat() if r.paid_at is not None else "",  # type: ignore[union-attr]
        recorded_by=str(r.recorded_by) if r.recorded_by is not None else None,
        created_at=r.created_at.isoformat() if r.created_at is not None else "",  # type: ignore[union-attr]
    )