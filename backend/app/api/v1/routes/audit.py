# app/api/v1/routes/audit.py
# GET    /audit            — list audit entries (Owner/Manager only)
# DELETE /audit            — clear all entries (Owner only)
# GET    /audit/export.csv — download as CSV
#
# Source: AuditService.gs api_getAuditLog + api_clearAuditLog.

import csv
import io
from datetime import datetime, timezone, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_active_tenant, get_db, require_permission
from app.models.audit_log import AuditLog

router = APIRouter(prefix="/audit", tags=["audit"])


def _filter_query(
    tenant_id: UUID,
    module: str | None,
    action: str | None,
    user_email: str | None,
    date_range: str | None,
):
    """Build shared SQLAlchemy select with optional filters."""
    q = select(AuditLog).where(AuditLog.tenant_id == tenant_id)

    if module:
        q = q.where(AuditLog.module == module)
    if action:
        q = q.where(AuditLog.action == action)
    if user_email:
        q = q.where(AuditLog.user_email.ilike(f"%{user_email}%"))

    now = datetime.now(timezone.utc)
    if date_range == "today":
        q = q.where(AuditLog.created_at >= now.replace(hour=0, minute=0, second=0, microsecond=0))
    elif date_range == "yesterday":
        start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        end   = now.replace(hour=0, minute=0, second=0, microsecond=0)
        q     = q.where(AuditLog.created_at >= start, AuditLog.created_at < end)
    elif date_range == "week":
        q = q.where(AuditLog.created_at >= now - timedelta(days=7))
    elif date_range == "month":
        q = q.where(AuditLog.created_at >= now - timedelta(days=30))

    return q.order_by(AuditLog.created_at.desc())


def _row_to_dict(row: AuditLog) -> dict:
    ts = row.created_at  # type: ignore[union-attr]
    ts_str = ts.strftime("%Y-%m-%d %H:%M") if ts is not None else ""
    return {
        "id":         str(row.id),
        "timestamp":  ts_str,
        "user_email": str(row.user_email or ""),
        "action":     str(row.action    or ""),
        "module":     str(row.module    or ""),
        "record_id":  str(row.record_id or ""),
        "summary":    str(row.summary   or ""),
    }


@router.get("")
async def list_audit(
    module:     str | None = Query(None),
    action:     str | None = Query(None),
    user_email: str | None = Query(None),
    date_range: str | None = Query(None),
    page:       int        = Query(1,   ge=1),
    page_size:  int        = Query(50,  ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_permission("manage_risks")),
) -> dict:
    """
    Filtered, paginated audit log.
    Accessible to Owner and Manager roles (require_permission("manage_risks") passes both).
    Source: AuditService.gs api_getAuditLog.
    """
    tenant_id = UUID(claims["active_tenant_id"])
    q         = _filter_query(tenant_id, module, action, user_email, date_range)

    all_rows = (await db.execute(q)).scalars().all()
    total    = len(all_rows)
    start    = (page - 1) * page_size
    page_rows = all_rows[start : start + page_size]

    return {
        "data":  [_row_to_dict(r) for r in page_rows],
        "error": None,
        "meta":  {"total": total, "page": page, "page_size": page_size},
    }


@router.delete("")
async def clear_audit(
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_permission("manage_users")),
) -> dict:
    """
    Clear all audit log entries for this workspace. Owner only.
    Source: AuditService.gs api_clearAuditLog.
    """
    role = str(claims.get("role") or "")
    if role != "Owner":
        return {"data": None, "error": "Only the workspace Owner can clear the audit log.", "meta": {}}

    tenant_id = UUID(claims["active_tenant_id"])
    await db.execute(delete(AuditLog).where(AuditLog.tenant_id == tenant_id))
    await db.flush()
    return {"data": {"cleared": True}, "error": None, "meta": {}}


@router.get("/export.csv")
async def export_audit_csv(
    module:     str | None = Query(None),
    action:     str | None = Query(None),
    user_email: str | None = Query(None),
    date_range: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_permission("manage_risks")),
) -> StreamingResponse:
    """
    Export current filtered audit log as a CSV file download.
    Source: GAS audit log Export CSV button in View_Users.html.
    """
    tenant_id = UUID(claims["active_tenant_id"])
    rows      = (await db.execute(
        _filter_query(tenant_id, module, action, user_email, date_range)
    )).scalars().all()

    buf = io.StringIO()
    writer = csv.DictWriter(
        buf, fieldnames=["timestamp", "user_email", "action", "module", "record_id", "summary"]
    )
    writer.writeheader()
    for row in rows:
        writer.writerow({
            "timestamp":  _row_to_dict(row)["timestamp"],
            "user_email": str(row.user_email or ""),
            "action":     str(row.action    or ""),
            "module":     str(row.module    or ""),
            "record_id":  str(row.record_id or ""),
            "summary":    str(row.summary   or ""),
        })

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_log.csv"},
    )