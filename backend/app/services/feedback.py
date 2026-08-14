# app/services/feedback.py
import logging
from uuid import UUID

import resend  # type: ignore
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.feedback import Feedback
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

_EVENT_LABELS: dict[str, str] = {
    "add_risk":      "Added First Risk",
    "import_risk":   "Imported Risks",
    "print_pdf":     "Generated PDF Report",
    "ai_insights":   "Used AI Risk Insights",
    "ai_dashboard":  "Used AI Dashboard Summary",
    "log_incident":  "Logged First Incident",
    "invite_user":   "Invited a User",
}


async def save_feedback(
    db: AsyncSession,
    tenant_id: UUID,
    account_id: UUID,
    email: str,
    event_key: str,
    rating: int,
    comment: str | None,
) -> None:
    row = Feedback(
        tenant_id=tenant_id,
        account_id=account_id,
        event_key=event_key,
        rating=rating,
        comment=comment,
    )
    db.add(row)
    await db.flush()

    # Best-effort workspace name lookup for the email
    workspace_name = ""
    try:
        ws_name = await db.scalar(select(Tenant.name).where(Tenant.id == tenant_id))
        workspace_name = str(ws_name or "")
    except Exception:
        pass

    # Email is non-blocking: failure never rolls back the DB write
    try:
        _send_founder_email(email, workspace_name, event_key, rating, comment)
    except Exception as exc:
        logger.warning("feedback email failed | event=%s | %s", event_key, exc)


def _send_founder_email(
    user_email: str,
    workspace_name: str,
    event_key: str,
    rating: int,
    comment: str | None,
) -> None:
    if not settings.RESEND_API_KEY or not settings.RESEND_FROM_EMAIL:
        return
    resend.api_key = settings.RESEND_API_KEY

    label = _EVENT_LABELS.get(event_key, event_key)
    stars = "\u2605" * rating + "\u2606" * (5 - rating)
    rating_color = "#16a34a" if rating >= 4 else "#b45309" if rating >= 3 else "#dc2626"
    comment_row = (
        f'<tr>'
        f'<td style="font-size:12px;color:#6b7280;padding-bottom:10px;vertical-align:top;">Comment</td>'
        f'<td style="font-size:13px;color:#374151;padding-bottom:10px;line-height:1.5;">{comment}</td>'
        f'</tr>'
        if comment else ""
    )
    html = (
        '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f7fb;font-family:Inter,Arial,sans-serif;">'
        '<div style="max-width:480px;margin:28px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">'
        '<div style="background:#1F2854;padding:16px 20px;">'
        '<div style="font-size:10px;font-weight:700;letter-spacing:.1em;color:#01b88e;text-transform:uppercase;margin-bottom:4px;">SmartRisk Pulse</div>'
        f'<div style="font-size:17px;font-weight:800;color:#fff;">{label}</div>'
        '</div>'
        '<div style="padding:20px;">'
        '<table width="100%" cellpadding="0" cellspacing="0">'
        '<tr>'
        '<td style="font-size:12px;color:#6b7280;width:90px;padding-bottom:10px;">Workspace</td>'
        f'<td style="font-size:13px;color:#1F2854;font-weight:600;padding-bottom:10px;">{workspace_name}</td>'
        '</tr>'
        '<tr>'
        '<td style="font-size:12px;color:#6b7280;padding-bottom:10px;">User</td>'
        f'<td style="font-size:13px;color:#1F2854;font-weight:600;padding-bottom:10px;">{user_email}</td>'
        '</tr>'
        '<tr>'
        '<td style="font-size:12px;color:#6b7280;padding-bottom:10px;">Rating</td>'
        '<td style="padding-bottom:10px;">'
        f'<span style="font-size:20px;color:#01b88e;letter-spacing:2px;">{stars}</span>'
        f'<span style="font-size:13px;font-weight:700;color:{rating_color};margin-left:8px;">{rating}/5</span>'
        '</td>'
        '</tr>'
        f'{comment_row}'
        '</table>'
        '</div>'
        '<div style="padding:12px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">'
        'SmartRisk Pulse \u00b7 Feedback Log'
        '</div>'
        '</div></body></html>'
    )

    params: resend.Emails.SendParams = {
        "from":    settings.RESEND_FROM_EMAIL,
        "to":      ["info@smartrisksheets.com"],
        "subject": f"SmartRisk Feedback \u2014 {rating}/5 \u2605 ({label})",
        "html":    html,
    }
    resend.Emails.send(params)