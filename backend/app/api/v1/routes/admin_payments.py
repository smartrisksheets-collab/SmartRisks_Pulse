from uuid import UUID
import httpx
from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_db
from app.core.admin_deps import get_current_admin
from app.core.exceptions import ResourceNotFoundError
from app.schemas.admin import PaymentCreate, PaymentOut, PaymentUpdate
from app.models.admin_account import AdminAccount
from app.models.payment import Payment
from app.models.tenant import Tenant
from app.services.admin_payment import list_payments, create_payment, update_payment

class SendReceiptRequest(BaseModel):
    email: str

router = APIRouter(prefix="/admin/workspaces", tags=["admin-payments"])


@router.get("/{workspace_id}/payments", response_model=dict)
async def get_payments(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: AdminAccount = Depends(get_current_admin),
) -> dict:
    items = await list_payments(db, workspace_id)
    return {"data": [i.model_dump() for i in items], "error": None, "meta": {}}


@router.patch("/{workspace_id}/payments/{payment_id}", response_model=dict)
async def patch_payment(
    workspace_id: UUID,
    payment_id: UUID,
    payload: PaymentUpdate,
    db: AsyncSession = Depends(get_db),
    _: AdminAccount = Depends(get_current_admin),
) -> dict:
    item = await update_payment(db, workspace_id, payment_id, payload)
    return {"data": item.model_dump(), "error": None, "meta": {}}


def _send_receipt_task(
    to: str,
    workspace_name: str,
    payment_id: str,
    amount: float,
    currency: str,
    method: str | None,
    reference: str | None,
    paid_at_iso: str,
    recorded_by: str | None,
    notes: str | None,
    logo_bytes: bytes | None,
) -> None:
    from datetime import date
    from app.services.payment_receipt import build_receipt_pdf
    from app.services.email import send_payment_receipt_email

    paid_at = date.fromisoformat(paid_at_iso)
    receipt_no = f"RCP-{payment_id[:8].upper()}"
    paid_at_str = f"{paid_at.day} {paid_at.strftime('%B %Y')}"

    pdf_bytes = build_receipt_pdf(
        workspace_name=workspace_name,
        payment_id=payment_id,
        amount=amount,
        currency=currency,
        method=method,
        reference=reference,
        paid_at=paid_at,
        recorded_by="SmartRisk Pulse",
        notes=notes,
        recipient_email=to,
        logo_bytes=logo_bytes,
    )

    send_payment_receipt_email(
        to=to,
        workspace_name=workspace_name,
        amount=amount,
        currency=currency,
        paid_at=paid_at_str,
        receipt_no=receipt_no,
        pdf_bytes=pdf_bytes,
    )


@router.post("/{workspace_id}/payments/{payment_id}/send-receipt", response_model=dict)
async def send_receipt(
    workspace_id: UUID,
    payment_id: UUID,
    body: SendReceiptRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: AdminAccount = Depends(get_current_admin),
) -> dict:
    payment = (await db.execute(
        select(Payment).where(
            Payment.id == payment_id,
            Payment.tenant_id == workspace_id,
        )
    )).scalar_one_or_none()

    if payment is None:
        raise ResourceNotFoundError("Payment not found.")

    tenant = (await db.execute(
        select(Tenant).where(Tenant.id == workspace_id)
    )).scalar_one_or_none()

    workspace_name = str(tenant.name or "Workspace") if tenant else "Workspace"
    receipt_no     = f"RCP-{str(payment.id)[:8].upper()}"

    _SMARTRISK_LOGO = "https://smartrisksheets.com/wp-content/uploads/2025/09/cropped-Smartrisksheets-favicon-v2.png"
    logo_bytes: bytes | None = None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(_SMARTRISK_LOGO)
            if resp.status_code == 200:
                logo_bytes = resp.content
    except Exception:
        pass

    paid_at_date = payment.paid_at  # type: ignore[union-attr]

    background_tasks.add_task(
        _send_receipt_task,
        to=body.email,
        workspace_name=workspace_name,
        payment_id=str(payment.id),
        amount=float(payment.amount),  # type: ignore[arg-type]
        currency=str(payment.currency or "USD"),
        method=str(payment.method) if payment.method else None,
        reference=str(payment.reference) if payment.reference else None,
        paid_at_iso=paid_at_date.isoformat(),  # type: ignore[union-attr]
        recorded_by=None,
        notes=str(payment.notes) if payment.notes else None,
        logo_bytes=logo_bytes,
    )

    return {"data": {"sent": True, "to": body.email}, "error": None, "meta": {}}


@router.post("/{workspace_id}/payments", response_model=dict)
async def record_payment(
    workspace_id: UUID,
    payload: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    admin: AdminAccount = Depends(get_current_admin),
) -> dict:
    item = await create_payment(db, workspace_id, payload, admin.name)
    return {"data": item.model_dump(), "error": None, "meta": {}}