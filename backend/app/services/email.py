# app/services/email.py
"""
Resend email delivery for Report Builder.
Used by routes/reports.py to email generated PDF reports.

Future phases (Brief engine, Phase 10) will add more functions here.
"""

from __future__ import annotations

import logging
from datetime import date
from html import escape as _esc

import resend

from app.core.config import settings

logger = logging.getLogger(__name__)



def _init() -> None:
    if not settings.RESEND_API_KEY:
        raise ValueError("RESEND_API_KEY is not configured")
    resend.api_key = settings.RESEND_API_KEY


def _derive_bullets(ei: dict, rs: dict, krc: dict, is_: dict) -> list[str]:
    """Fallback bullet derivation when no executive-dashboard or AI text is present.
    Source: Reportservice.gs buildEmailBullets_() lines 1568-1583."""
    bullets: list[str] = []
    score      = ei.get("score", 0)
    high_count = rs.get("high_count") or rs.get("highCount", 0)
    new_high   = krc.get("new_high_risks") or krc.get("newHighRisks", 0)
    open_inc   = is_.get("open", 0)
    if score:
        bullets.append(f"Exposure index is {score}/100 ({ei.get('label', '')}).")
    if high_count:
        s = "s" if high_count > 1 else ""
        bullets.append(f"{high_count} risk{s} rated High or Critical are currently active.")
    if new_high:
        s = "s" if new_high > 1 else ""
        bullets.append(f"{new_high} new high-risk item{s} identified this period.")
    if open_inc == 0 and is_.get("total", 0) > 0:
        bullets.append("No open incidents — all incidents resolved.")
    elif open_inc:
        s = "s" if open_inc > 1 else ""
        bullets.append(f"{open_inc} open incident{s} requiring resolution.")
    if not bullets:
        bullets.append("Risk posture is stable. See the attached report for details.")
    return bullets


def _posture_cell(label: str, value: str, color: str, last: bool = False) -> str:
    border = "" if last else "border-right:1px solid #e2e8f0;"
    return (
        f'<td style="width:33.33%;padding:8px 12px;text-align:center;{border}">'
        f'<div style="font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;'
        f'letter-spacing:.06em;margin-bottom:3px;">{_esc(label)}</div>'
        f'<div style="font-size:12px;font-weight:700;color:{color};">{_esc(value)}</div>'
        f'</td>'
    )


def _build_email_html(
    title:      str,
    block_data: dict,
    ai_data:    dict,
    org_name:   str,
    today_str:  str,
) -> str:
    """
    Builds a summary HTML email body.
    KPI and bullet priority: executive-dashboard block → AI narrative → derived fallback.
    Posture row (Status/Trend/Confidence) inserted when executive-dashboard data present.
    Brand: Navy #1F2854, Teal #01b88e. No gradients. Solid colors only.
    Source: Reportservice.gs generateEmailSummaryHtml_() lines 1520-1566.
    """
    ed  = block_data.get("executive-dashboard") or {}
    ei  = block_data.get("exposure-index")      or block_data.get("exposure_index")  or {}
    rs  = block_data.get("risk-snapshot")       or block_data.get("risk_snapshot")   or {}
    krc = block_data.get("key-risk-changes")    or block_data.get("key_risk_changes") or {}
    is_ = block_data.get("incident-stability")  or block_data.get("incident_stability") or {}

    # ── KPI row ────────────────────────────────────────────────────────────────
    # Use executive-dashboard kpis (6 data-driven metrics) when available.
    # Fall back to 4 hardcoded metrics from individual blocks.
    ed_kpis: list[dict] = ed.get("kpis") or []
    if ed_kpis:
        n   = len(ed_kpis)
        pct = f"{100 / n:.2f}%"
        kpi_cells = "".join(
            f'<td style="width:{pct};padding:12px 6px;text-align:center;'
            f'{"" if i == n - 1 else "border-right:1px solid #e2e8f0;"}">'
            f'<div style="font-size:19px;font-weight:700;color:{_esc(k.get("color","#1F2854"))};">'
            f'{_esc(str(k.get("value","")))}' 
            f'<span style="font-size:10px;font-weight:400;color:#94a3b8;">'
            f'{_esc(k.get("unit","") or "")}</span>'
            f'</div>'
            f'<div style="font-size:10px;color:#64748b;margin-top:2px;">{_esc(k.get("label",""))}</div>'
            f'</td>'
            for i, k in enumerate(ed_kpis)
        )
    else:
        score      = ei.get("score", 0)
        health     = 100 - score
        high_count = rs.get("high_count") or rs.get("highCount", 0)
        new_high   = krc.get("new_high_risks") or krc.get("newHighRisks", 0)
        fallback_kpis = [
            ("Exposure Index", f"{score}/100",  "#1F2854"),
            ("Risk Health",    f"{health}/100", "#10b981"),
            ("High Risks",     str(high_count), "#ef4444"),
            ("New High Risks", str(new_high),   "#f59e0b"),
        ]
        kpi_cells = "".join(
            f'<td style="width:25%;padding:12px 8px;text-align:center;'
            f'{"" if i == 3 else "border-right:1px solid #e2e8f0;"}">'
            f'<div style="font-size:21px;font-weight:700;color:{c};">{_esc(v)}</div>'
            f'<div style="font-size:11px;color:#64748b;margin-top:3px;">{_esc(l)}</div>'
            f'</td>'
            for i, (l, v, c) in enumerate(fallback_kpis)
        )

    # ── Posture row ────────────────────────────────────────────────────────────
    posture      = ed.get("posture") or {}
    posture_html = ""
    if posture.get("status") or posture.get("trend"):
        trend       = posture.get("trend", "Stable")
        trend_color = (
            "#10b981" if trend == "Improving" else
            "#ef4444" if trend == "Worsening" else
            "#f59e0b"
        )
        posture_html = (
            '<table style="width:100%;border-collapse:collapse;background:#f8faff;'
            'border-bottom:1px solid #e2e8f0;">'
            '<tr>'
            + _posture_cell("Status",     posture.get("status", ""),     "#1F2854")
            + _posture_cell("Trend",      trend,                          trend_color)
            + _posture_cell("Confidence", posture.get("confidence", ""), "#1F2854", last=True)
            + '</tr></table>'
        )

    # ── Bullets ────────────────────────────────────────────────────────────────
    # Priority: AI narrative → executive-dashboard computed bullets → derived fallback.
    # Matches GAS: ed.bullets takes priority over buildEmailBullets_().
    ai_text = (ai_data or {}).get("executive-dashboard") or ""
    if ai_text.strip():
        bullets: list[str] = [b.strip() for b in ai_text.split("\n") if b.strip()]
    elif ed.get("bullets"):
        bullets = [str(b) for b in ed["bullets"] if b]
    else:
        bullets = _derive_bullets(ei, rs, krc, is_)

    bullet_rows = "".join(
        f'<tr><td style="padding:6px 0;font-size:12px;color:#334155;'
        f'border-bottom:1px solid #f1f5f9;line-height:1.5;">'
        f'<span style="color:#01b88e;font-weight:700;margin-right:8px;">&#9679;</span>'
        f'{_esc(b)}'
        f'</td></tr>'
        for b in bullets
    )

    # ── Header secondary line ─────────────────────────────────────────────────
    org_line = (
        f'<div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:2px;">'
        f'{_esc(org_name)}</div>'
        if org_name and org_name.strip() and org_name.strip() != title.strip()
        else ""
    )

    return (
        '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;margin:0;'
        'padding:0;background:#f1f5f9;">'
        '<div style="max-width:600px;margin:24px auto;border-radius:10px;'
        'overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">'

        # Navy header
        '<div style="background:#1F2854;padding:24px 28px;">'
        f'<div style="font-size:18px;font-weight:700;color:#fff;">{_esc(title)}</div>'
        + org_line +
        f'<div style="font-size:11px;color:#94a3b8;margin-top:4px;">'
        f'Generated: {_esc(today_str)}</div>'
        '</div>'

        # KPI strip
        f'<table style="width:100%;border-collapse:collapse;background:#fff;'
        f'border-bottom:1px solid #e2e8f0;"><tr>{kpi_cells}</tr></table>'

        # Posture row (conditional)
        + posture_html +

        # Bullets section
        '<div style="background:#fff;padding:20px 28px;">'
        '<div style="font-size:11px;font-weight:700;color:#1F2854;text-transform:uppercase;'
        'letter-spacing:.06em;margin-bottom:10px;">Summary</div>'
        f'<table style="width:100%;border-collapse:collapse;">{bullet_rows}</table>'
        '</div>'

        # Footer note
        '<div style="background:#f8faff;padding:14px 28px;border-top:1px solid #e2e8f0;">'
        '<div style="font-size:11px;color:#64748b;">'
        'See the attached PDF for the full report.</div>'
        '</div>'

        # Navy brand bar
        '<div style="background:#1F2854;padding:10px 28px;">'
        '<div style="font-size:10px;color:rgba(255,255,255,.4);text-align:center;">'
        'SmartRisk Pulse &mdash; Confidential Risk Intelligence</div>'
        '</div>'

        '</div></body></html>'
    )


async def send_report_email(
    to:         str,
    subject:    str,
    title:      str,
    block_data: dict,
    ai_data:    dict,
    org_name:   str,
    pdf_bytes:  bytes,
    file_name:  str,
) -> None:
    """
    Emails the PDF report as an attachment with an HTML summary body.
    Raises on failure — caller handles the exception.
    """
    _init()
    if not settings.RESEND_FROM_EMAIL:
        raise ValueError("RESEND_FROM_EMAIL is not configured")

    today_str  = f"{date.today().day} {date.today().strftime('%B %Y')}"
    html_body  = _build_email_html(title, block_data, ai_data, org_name, today_str)

    import base64
    pdf_b64 = base64.b64encode(pdf_bytes).decode()

    params: resend.Emails.SendParams = {
        "from":        settings.RESEND_FROM_EMAIL,
        "to":          [to],
        "subject":     subject,
        "html":        html_body,
        "attachments": [
            {
                "filename": file_name,
                "content":  pdf_b64,
            }
        ],
    }

    resend.Emails.send(params)
    logger.info("Report email sent | to=%s | subject=%s", to, subject)


# ── External submission emails ────────────────────────────────────────────────
# Source: ExternalRiskService.gs — _sendSubmissionConfirmation_,
#         api_approveExternalRisk (inline email block), api_returnExternalRisk.

_PRODUCT_LOGO = (
    "https://smartrisksheets.com/wp-content/uploads/2025/09/"
    "cropped-Smartrisksheets-favicon-v2.png"
)

def _ext_header(org_name: str) -> str:
    return (
        f'<tr><td style="background:#1F2854;padding:28px 36px;">'
        f'<div style="display:flex;align-items:center;gap:12px;">'
        f'<img src="{_PRODUCT_LOGO}" width="36" height="36" alt="SmartRisk"'
        f' style="border-radius:8px;flex-shrink:0;" />'
        f'<div>'
        f'<div style="font-size:18px;font-weight:700;color:#fff;">{org_name}</div>'
        f'<div style="font-size:12px;color:#94a3b8;margin-top:2px;">Risk Management Platform</div>'
        f'</div>'
        f'</div>'
        f'</td></tr>'
    )


def _ext_footer(org_name: str) -> str:
    from datetime import date as _date
    d = f"{_date.today().day} {_date.today().strftime('%B %Y')}"
    return (
        f'<tr><td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e5e7eb;">'
        f'<p style="font-size:11px;color:#94a3b8;margin:0;text-align:center;">'
        f'Sent {d} via {org_name} SmartRisk GRC. Automated notification — do not reply.'
        f'</p></td></tr>'
    )


def _ext_wrap(org_name: str, body_rows: str) -> str:
    return (
        '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">'
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;"><tr><td align="center">'
        '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">'
        + _ext_header(org_name)
        + body_rows
        + _ext_footer(org_name)
        + '</table></td></tr></table></body></html>'
    )


def send_submission_confirmation(
    to:              str,
    submitter_name:  str,
    submission_id:   str,
    submission_type: str,
    category:        str,
    description:     str,
    org_name:        str,
) -> None:
    """
    Sent to submitter immediately after a successful external submission.
    Mirrors _sendSubmissionConfirmation_ in ExternalRiskService.gs.
    """
    _init()
    if not settings.RESEND_FROM_EMAIL:
        raise ValueError("RESEND_FROM_EMAIL is not configured")

    label = "Risk" if submission_type == "risk" else "Incident"
    body = (
        f'<tr><td style="padding:36px;">'
        f'<p style="font-size:15px;color:#1e293b;margin:0 0 16px;">Dear {submitter_name},</p>'
        f'<p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 24px;">'
        f'Your {label.lower()} submission has been received and is pending review.</p>'
        f'<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:10px;margin-bottom:24px;">'
        f'<tr><td style="padding:16px 20px;">'
        f'<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:10px;">Submission Receipt</div>'
        f'<div style="font-size:13px;color:#334155;margin-bottom:6px;"><strong>ID:</strong> {submission_id}</div>'
        f'<div style="font-size:13px;color:#334155;margin-bottom:6px;"><strong>Category:</strong> {category or "—"}</div>'
        f'<div style="font-size:13px;color:#334155;"><strong>Description:</strong> {description or "—"}</div>'
        f'</td></tr></table>'
        f'<p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 24px;">'
        f'You will receive a follow-up email once the review is complete.</p>'
        f'<p style="font-size:14px;color:#475569;margin:0;">Best regards,<br>'
        f'<strong style="color:#1e293b;">{org_name} Risk Team</strong></p>'
        f'</td></tr>'
    )
    params: resend.Emails.SendParams = {
        "from":    settings.RESEND_FROM_EMAIL,
        "to":      [to],
        "subject": f"{label} Submission Confirmed — {submission_id}",
        "html":    _ext_wrap(org_name, body),
    }
    resend.Emails.send(params)
    logger.info("Submission confirmation sent | to=%s | id=%s", to, submission_id)


def send_approval_email(
    to:             str,
    submitter_name: str,
    created_id:     str,
    category:       str,
    description:    str,
    org_name:       str,
) -> None:
    """
    Sent to submitter when their submission is approved and promoted to the register.
    Mirrors inline email block in api_approveExternalRisk in ExternalRiskService.gs.
    """
    _init()
    if not settings.RESEND_FROM_EMAIL:
        raise ValueError("RESEND_FROM_EMAIL is not configured")

    body = (
        f'<tr><td style="padding:36px;">'
        f'<p style="font-size:15px;color:#1e293b;margin:0 0 16px;">Dear {submitter_name},</p>'
        f'<div style="border-left:4px solid #01b88e;padding:14px 18px;background:#f0fdf9;border-radius:0 10px 10px 0;margin-bottom:24px;">'
        f'<div style="font-size:14px;font-weight:700;color:#1F2854;">Your submission has been approved</div>'
        f'<div style="font-size:13px;color:#475569;margin-top:4px;">Added to the register as <strong>{created_id}</strong>.</div>'
        f'</div>'
        f'<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:10px;margin-bottom:24px;">'
        f'<tr><td style="padding:16px 20px;">'
        f'<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:10px;">Submission Summary</div>'
        f'<div style="font-size:13px;color:#334155;margin-bottom:6px;"><strong>Category:</strong> {category or "—"}</div>'
        f'<div style="font-size:13px;color:#334155;"><strong>Description:</strong> {description or "—"}</div>'
        f'</td></tr></table>'
        f'<p style="font-size:14px;color:#475569;margin:0;">Best regards,<br>'
        f'<strong style="color:#1e293b;">{org_name} Risk Team</strong></p>'
        f'</td></tr>'
    )
    params: resend.Emails.SendParams = {
        "from":    settings.RESEND_FROM_EMAIL,
        "to":      [to],
        "subject": f"Submission Approved — {org_name}",
        "html":    _ext_wrap(org_name, body),
    }
    resend.Emails.send(params)
    logger.info("Approval email sent | to=%s | created_id=%s", to, created_id)


def send_return_email(
    to:             str,
    submitter_name: str,
    category:       str,
    description:    str,
    return_message: str,
    org_name:       str,
) -> None:
    """
    Sent to submitter when their submission is returned with reviewer feedback.
    Mirrors api_returnExternalRisk in ExternalRiskService.gs.
    """
    _init()
    if not settings.RESEND_FROM_EMAIL:
        raise ValueError("RESEND_FROM_EMAIL is not configured")

    safe_message = return_message.replace("\n", "<br>")
    body = (
        f'<tr><td style="padding:36px;">'
        f'<p style="font-size:15px;color:#1e293b;margin:0 0 16px;">Dear {submitter_name},</p>'
        f'<p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 24px;">'
        f'Your submission requires additional information before it can be approved.</p>'
        f'<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:10px;margin-bottom:24px;">'
        f'<tr><td style="padding:16px 20px;">'
        f'<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:10px;">Submission Summary</div>'
        f'<div style="font-size:13px;color:#334155;margin-bottom:6px;"><strong>Category:</strong> {category or "—"}</div>'
        f'<div style="font-size:13px;color:#334155;"><strong>Description:</strong> {description or "—"}</div>'
        f'</td></tr></table>'
        f'<div style="border-left:4px solid #01b88e;padding:14px 18px;background:#f0fdf9;border-radius:0 10px 10px 0;margin-bottom:28px;">'
        f'<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:8px;">Reviewer Message</div>'
        f'<p style="font-size:14px;color:#1e293b;line-height:1.7;margin:0;">{safe_message}</p>'
        f'</div>'
        f'<p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 24px;">'
        f'Please resubmit with the requested information.</p>'
        f'<p style="font-size:14px;color:#475569;margin:0;">Best regards,<br>'
        f'<strong style="color:#1e293b;">{org_name} Risk Team</strong></p>'
        f'</td></tr>'
    )
    params: resend.Emails.SendParams = {
        "from":    settings.RESEND_FROM_EMAIL,
        "to":      [to],
        "subject": f"Submission Returned — {org_name}",
        "html":    _ext_wrap(org_name, body),
    }
    resend.Emails.send(params)
    logger.info("Return email sent | to=%s", to)


# ── Brief email (Phase 10) ────────────────────────────────────────────────
# Source: BriefEmailService.gs _buildEmailHtml_ + daily-risk-brief.html template.

def _signal_icon(stype: str) -> str:
    icons = {"exposure_up": "↑", "exposure_down": "↓", "band_crossing": "▲",
             "control_fail": "ℹ", "control_overdue": "⏰", "incident": "⚠",
             "net_new_critical": "●", "score_change": "⇄"}
    return icons.get(stype, "•")


def _signal_color(stype: str) -> str:
    colors = {"exposure_up": "#f5a623", "exposure_down": "#01b88e",
              "band_crossing": "#d1364a", "control_fail": "#d1364a",
              "control_overdue": "#f5a623", "incident": "#f5a623",
              "net_new_critical": "#d1364a", "score_change": "#01b88e"}
    return colors.get(stype, "#5a6b8c")


def _signal_text(row: object) -> str:
    from app.schemas.brief import SignalRow
    if not isinstance(row, SignalRow):
        return ""
    t = row.type
    if t == "exposure_up":
        return (f'<strong style="color:#1f2854;">Risk exposure increased overnight</strong> — '
                f'{_esc(row.exposure_driver or "controls may need strengthening")}. '
                f'Review impacted risks in the register.')
    if t == "exposure_down":
        return (f'<strong style="color:#1f2854;">Risk exposure improved overnight</strong> — '
                f'{_esc(row.exposure_driver or "control measures are showing effect")}. '
                f'Keep monitoring to sustain progress.')
    if t == "band_crossing":
        n = int(row.exposure_delta or 1)
        return (f'<strong style="color:#1f2854;">{n} risk{"s" if n != 1 else ""} escalated '
                f'to a higher severity band</strong> — '
                f'{_esc(row.exposure_driver or "confirm mitigation plans are active")}.')
    if t == "control_fail":
        n = int(row.failed_controls or 0)
        return (f'<strong style="color:#1f2854;">{n} control{"s" if n != 1 else ""} failed '
                f'effectiveness checks overnight</strong> — remediation action is required before the next review cycle.')
    if t == "control_overdue":
        n = int(row.failed_controls or 0)
        return (f'<strong style="color:#1f2854;">{n} control test{"s" if n != 1 else ""} are '
                f'past their scheduled date</strong> — schedule retesting to avoid gaps in assurance coverage.')
    if t == "incident":
        n = int(row.incident_count or 0)
        return (f'<strong style="color:#1f2854;">{n} new incident{"s" if n != 1 else ""} logged '
                f'in {_esc(row.incident_area or "General")}</strong> — '
                f'SLA clock is running. Open the register to assign response ownership.')
    return _esc(str(row.exposure_driver or ""))


def _level_style(level: str) -> str:
    base = "display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;"
    l = (level or "").lower()
    if l in ("critical", "high"):
        return base + "color:#c02a3d;background-color:#fdeaed;"
    if l == "medium":
        return base + "color:#b9791a;background-color:#fdf3e2;"
    return base + "color:#5a6b8c;background-color:#eef1f6;"


def build_brief_html(payload: object) -> str:
    """
    Build brief email HTML from the BriefPayload.
    Mirrors daily-risk-brief.html template structure and BriefEmailService.gs _buildEmailHtml_.
    Brand: Navy #1f2854, Teal #01b88e. No gradients.
    """
    from app.schemas.brief import BriefPayload, BriefTableRow
    if not isinstance(payload, BriefPayload):
        return ""

    reader      = payload.reader
    first_name  = _esc(reader.first_name if reader else "there")
    ws_name     = _esc(payload.meta.workspace_name if payload.meta else "SmartRisk")
    greeting    = _esc(payload.greeting or "Good morning")
    rec_action  = _esc(payload.recommended_action or "No immediate actions required.")
    preheader   = _esc(payload.residual_change_summary or "")
    crit_count  = payload.critical_count

    # ── Signal rows ──────────────────────────────────────────────────────
    if payload.signal_rows:
        signal_rows_html = "\n".join(
            f'<tr>'
            f'<td valign="top" width="34" style="width:34px;padding:16px 0;">'
            f'<span style="font-family:Arial,Helvetica,sans-serif;font-size:20px;'
            f'color:{_signal_color(r.type)};line-height:1;">{_signal_icon(r.type)}</span>'
            f'</td>'
            f'<td valign="middle" style="padding:16px 0;border-bottom:1px solid #eef1f6;'
            f"font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:15.5px;color:#3a4560;line-height:1.5;\">"
            f'{_signal_text(r)}'
            f'</td>'
            f'</tr>'
            for r in payload.signal_rows
        )
    else:
        signal_rows_html = (
            '<tr>'
            '<td valign="top" width="34" style="width:34px;padding:16px 0;">'
            '<span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;color:#01b88e;">&#10003;</span>'
            '</td>'
            '<td valign="middle" style="padding:16px 0;border-bottom:1px solid #eef1f6;'
            "font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:15.5px;color:#3a4560;line-height:1.5;\">"
            '<strong style="color:#1f2854;">No material movement overnight.</strong>'
            '</td>'
            '</tr>'
        )

    # Empty daily override replaces the recommended callout
    daily_ex = payload.daily_exception
    if daily_ex and daily_ex.is_empty and daily_ex.empty_message:
        callout_html = (
            '<tr><td class="sr-pad" style="padding:14px 36px 8px 36px;">'
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
            ' style="background-color:#eafaf5;border:1px solid #cdeee2;border-radius:12px;">'
            '<tr><td style="padding:18px 22px;font-family:\'Segoe UI\',Helvetica,Arial,sans-serif;'
            'font-size:15px;color:#2f5c50;line-height:1.6;">'
            f'<strong style="color:#00876a;">All clear:</strong> {_esc(daily_ex.empty_message)}'
            '</td></tr></table></td></tr>'
        )
    else:
        callout_html = (
            '<tr><td class="sr-pad" style="padding:14px 36px 8px 36px;">'
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
            ' style="background-color:#eafaf5;border:1px solid #cdeee2;border-radius:12px;">'
            '<tr><td style="padding:18px 22px;font-family:\'Segoe UI\',Helvetica,Arial,sans-serif;'
            'font-size:15px;color:#2f5c50;line-height:1.6;">'
            f'<strong style="color:#00876a;">Recommended:</strong> {rec_action}'
            '</td></tr></table></td></tr>'
        )

    # ── Tables ───────────────────────────────────────────────────────────
    tables = payload.tables
    volatile_block = ""
    if tables and tables.volatile:
        rows_html = "\n".join(
            f'<tr>'
            f'<td style="padding:11px 0;font-size:13.5px;font-weight:700;color:#1f2854;border-bottom:1px solid #f2f4f8;">{_esc(r.id)}</td>'
            f'<td style="padding:11px 0;font-size:13.5px;color:#5a6b8c;border-bottom:1px solid #f2f4f8;">{_esc(r.description)}</td>'
            f'<td align="right" style="padding:11px 0;border-bottom:1px solid #f2f4f8;">'
            f'<span style="{_level_style(r.level or "")}">{_esc(r.level or "")}</span>'
            f'</td></tr>'
            for r in tables.volatile
        )
        volatile_block = (
            '<tr><td class="sr-pad" style="padding:26px 36px 0 36px;'
            "font-family:'Segoe UI',Helvetica,Arial,sans-serif;\">"
            '<div style="font-size:14px;font-weight:700;color:#1f2854;padding-bottom:2px;">'
            '<span style="color:#f5a623;">&#9650;</span>&nbsp; Volatile / Increasing Risks</div>'
            '</td></tr>'
            '<tr><td class="sr-pad" style="padding:8px 36px 0 36px;">'
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
            " style=\"font-family:'Segoe UI',Helvetica,Arial,sans-serif;border-collapse:collapse;\">"
            '<tr>'
            '<td style="padding:8px 0;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#9aa4b8;border-bottom:1px solid #eef1f6;">ID</td>'
            '<td style="padding:8px 0;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#9aa4b8;border-bottom:1px solid #eef1f6;">Description</td>'
            '<td align="right" style="padding:8px 0;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#9aa4b8;border-bottom:1px solid #eef1f6;">Level</td>'
            f'</tr>{rows_html}</table></td></tr>'
        )

    hc_block = ""
    if tables and tables.high_critical:
        rows_html = "\n".join(
            f'<tr><td style="padding:14px 0 0;">'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
            f'<tr>'
            f'<td style="font-size:12px;font-weight:800;color:#1f2854;letter-spacing:.4px;">{_esc(r.id)}</td>'
            f'<td align="right"><span style="{_level_style(r.level or "")}">{_esc(r.level or "")}</span></td>'
            f'</tr>'
            f'<tr><td colspan="2" style="font-size:14px;color:#1f2854;font-weight:600;padding-top:5px;line-height:1.45;">{_esc(r.description)}</td></tr>'
            f'<tr><td colspan="2" style="font-size:11.5px;color:#01b88e;font-style:italic;padding:5px 0 14px;border-bottom:1px solid #f2f4f8;line-height:1.5;">'
            f'{"&#8594; " + _esc(r.action) if r.action else ""}'
            f'</td></tr>'
            f'</table></td></tr>'
            for r in tables.high_critical
        )
        hc_block = (
            '<tr><td class="sr-pad" style="padding:24px 36px 0 36px;'
            "font-family:'Segoe UI',Helvetica,Arial,sans-serif;\">"
            '<div style="font-size:14px;font-weight:700;color:#1f2854;padding-bottom:2px;">'
            '<span style="color:#d1364a;">&#9679;</span>&nbsp; High &amp; Critical Risks</div>'
            '</td></tr>'
            '<tr><td class="sr-pad" style="padding:8px 36px 0 36px;">'
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
            " style=\"font-family:'Segoe UI',Helvetica,Arial,sans-serif;border-collapse:collapse;\">"
            f'{rows_html}</table></td></tr>'
        )

    stale_block = ""
    if tables and tables.stale:
        rows_html = "\n".join(
            f'<tr>'
            f'<td style="padding:11px 0;font-size:13.5px;font-weight:700;color:#1f2854;border-bottom:1px solid #f2f4f8;">{_esc(r.id)}</td>'
            f'<td style="padding:11px 0;font-size:13.5px;color:#5a6b8c;border-bottom:1px solid #f2f4f8;">{_esc(r.description)}</td>'
            f'<td align="right" style="padding:11px 0;border-bottom:1px solid #f2f4f8;">'
            f'<span style="{_level_style(r.level or "")}">{_esc(r.level or "")}</span>'
            f'</td></tr>'
            for r in tables.stale
        )
        stale_block = (
            '<tr><td class="sr-pad" style="padding:24px 36px 0 36px;'
            "font-family:'Segoe UI',Helvetica,Arial,sans-serif;\">"
            '<div style="font-size:14px;font-weight:700;color:#1f2854;padding-bottom:2px;">'
            '<span style="color:#9aa4b8;">&#9203;</span>&nbsp; Stale Risks (30+ days)</div>'
            '</td></tr>'
            '<tr><td class="sr-pad" style="padding:8px 36px 0 36px;">'
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
            " style=\"font-family:'Segoe UI',Helvetica,Arial,sans-serif;border-collapse:collapse;\">"
            '<tr>'
            '<td style="padding:8px 0;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#9aa4b8;border-bottom:1px solid #eef1f6;">ID</td>'
            '<td style="padding:8px 0;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#9aa4b8;border-bottom:1px solid #eef1f6;">Description</td>'
            '<td align="right" style="padding:8px 0;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#9aa4b8;border-bottom:1px solid #eef1f6;">Level</td>'
            f'</tr>{rows_html}</table></td></tr>'
        )

    # ── Outreach block ───────────────────────────────────────────────────
    outreach_block = ""
    if payload.outreach:
        rows_html = "\n".join(
            f'<tr><td style="padding:9px 0;border-bottom:1px solid #f2f4f8;'
            "font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:13.5px;color:#5a6b8c;line-height:1.5;\">"
            f'<strong>{_esc(item.owner_name)}</strong>'
            f'{" &mdash; <strong style=\"color:#1f2854;\">" + _esc(item.risk_id) + "</strong>" if item.risk_id else ""}'
            f': {_esc(item.message)}'
            f'</td></tr>'
            for item in payload.outreach
        )
        outreach_block = (
            '<tr><td class="sr-pad" style="padding:24px 36px 0 36px;'
            "font-family:'Segoe UI',Helvetica,Arial,sans-serif;\">"
            '<div style="font-size:14px;font-weight:700;color:#1f2854;padding-bottom:2px;">'
            '<span style="color:#01b88e;">&#9993;</span>&nbsp; Suggested Outreach</div>'
            '</td></tr>'
            '<tr><td class="sr-pad" style="padding:8px 36px 20px 36px;">'
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
            " style=\"font-family:'Segoe UI',Helvetica,Arial,sans-serif;border-collapse:collapse;\">"
            f'{rows_html}</table></td></tr>'
        )

    return (
        '<!DOCTYPE html>'
        '<html lang="en" xmlns="http://www.w3.org/1999/xhtml">'
        '<head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        '<title>Your Daily Risk Brief</title>'
        '<style>'
        '@media only screen and (max-width:600px){'
        '.sr-container{width:100%!important}.sr-pad{padding-left:22px!important;padding-right:22px!important}'
        '.sr-greeting{font-size:26px!important}}'
        'a{text-decoration:none}'
        '</style></head>'
        '<body style="margin:0;padding:0;background-color:#f4f6fa;">'

        # preheader
        f'<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f4f6fa;opacity:0;">'
        f"Today's risk posture — {preheader}. {crit_count} items need attention before committee."
        f'</div>'

        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6fa;">'
        '<tr><td align="center" style="padding:32px 16px;">'

        # card
        '<table role="presentation" class="sr-container" width="600" cellpadding="0" cellspacing="0" border="0"'
        ' style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #e6eaf2;border-radius:16px;overflow:hidden;">'

        # header
        '<tr><td class="sr-pad" style="padding:28px 36px 20px 36px;border-bottom:1px solid #eef1f6;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
        '<td width="46" valign="middle" style="width:46px;">'
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
        '<td width="46" height="46" align="center" valign="middle"'
        ' style="width:46px;height:46px;background-color:#141c3a;border-radius:50%;color:#ffffff;'
        'font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:.5px;">SR</td>'
        '</tr></table></td>'
        '<td valign="middle" style="padding-left:14px;font-family:\'Segoe UI\',Helvetica,Arial,sans-serif;">'
        f'<div style="font-size:15px;font-weight:700;color:#1f2854;line-height:1.3;">{ws_name} · Daily Risk Brief</div>'
        f'<div style="font-size:13px;color:#9aa4b8;line-height:1.3;">to {first_name}</div>'
        '</td></tr></table></td></tr>'

        # greeting
        '<tr><td class="sr-pad" style="padding:30px 36px 4px 36px;font-family:\'Segoe UI\',Helvetica,Arial,sans-serif;">'
        f'<div class="sr-greeting" style="font-size:30px;font-weight:700;color:#141c3a;line-height:1.2;">{greeting}.</div>'
        '<div style="font-size:15px;color:#9aa4b8;line-height:1.5;margin-top:6px;">Today\'s risk posture — overnight changes</div>'
        '</td></tr>'

        # signal rows
        '<tr><td class="sr-pad" style="padding:22px 36px 6px 36px;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
        f'{signal_rows_html}'
        '</table></td></tr>'

        # recommended callout or empty daily
        + callout_html

        # tables
        + volatile_block + hc_block + stale_block

        # outreach
        + outreach_block

        # CTA
        + '<tr><td class="sr-pad" align="center" style="padding:34px 36px 12px 36px;font-family:\'Segoe UI\',Helvetica,Arial,sans-serif;">'
        '<div style="font-size:13.5px;color:#9aa4b8;line-height:1.5;padding-bottom:18px;">Review and action all risks in your register.</div>'
        '<a href="https://app.smartrisksheets.com"'
        ' style="display:inline-block;background-color:#141c3a;color:#ffffff;font-size:14px;font-weight:700;padding:13px 28px;border-radius:10px;">'
        'Open Risk Register &#8594;</a>'
        '</td></tr>'

        # footer
        + '<tr><td class="sr-pad" style="padding:26px 36px 30px 36px;border-top:1px solid #eef1f6;font-family:\'Segoe UI\',Helvetica,Arial,sans-serif;">'
        '<div style="font-size:12px;color:#9aa4b8;line-height:1.6;">'
        'Sent by SmartRisk Sheets Technologies Limited · RC 9170218 · NDPC/DCP/12625<br>'
        "You're receiving this because daily briefs are enabled for your account."
        '</div></td></tr>'

        + '</table></td></tr></table></body></html>'
    )


def build_brief_subject(payload: object) -> str:
    """Source: BriefEmailService.gs _buildSubject_."""
    from app.schemas.brief import BriefPayload
    if not isinstance(payload, BriefPayload):
        return "SmartRisk · Daily Risk Brief"
    sections = payload.meta.cadence_sections if payload.meta else []
    ws       = payload.meta.workspace_name if payload.meta else "SmartRisk"
    prefix   = ""
    if "quarterly_board_summary" in sections:
        prefix = "[Quarterly] "
    elif "monthly_posture" in sections:
        prefix = "[Monthly] "
    elif "weekly_digest" in sections:
        prefix = "[Weekly] "

    daily = payload.daily_exception
    if daily and daily.is_empty:
        return f"{prefix}{ws} Brief — No material movement today"

    if payload.critical_count:
        n = payload.critical_count
        return f'{prefix}{ws} Brief — {n} Critical risk{"s" if n != 1 else ""} require attention'

    if payload.signal_rows:
        n = len(payload.signal_rows)
        return f'{prefix}{ws} Brief — {n} update{"s" if n != 1 else ""} since last brief'

    return f"{prefix}{ws} · Daily Risk Brief"


def send_invite_email(
    to:             str,
    invitee_name:   str,
    invited_by:     str,
    workspace_name: str,
    role:           str,
    invite_link:    str = "",
) -> None:
    """
    Sent to a newly added workspace member.
    Notifies them they have been invited and what role they hold.
    """
    _init()
    if not settings.RESEND_FROM_EMAIL:
        raise ValueError("RESEND_FROM_EMAIL is not configured")

    display_name = invitee_name.strip() if invitee_name.strip() else "there"
    role_display = "Admin" if role == "Owner" else role
    body = (
        f'<tr><td style="padding:36px;">'
        f'<p style="font-size:15px;color:#1e293b;margin:0 0 16px;">Hi {display_name},</p>'
        f'<p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 24px;">'
        f'<strong style="color:#1e293b;">{invited_by}</strong> has added you to '
        f'<strong style="color:#1e293b;">{workspace_name}</strong> on SmartRisk GRC '
        f'as a <strong style="color:#1F2854;">{role_display}</strong>.</p>'
        f'<div style="border-left:4px solid #01b88e;padding:14px 18px;background:#f0fdf9;'
        f'border-radius:0 10px 10px 0;margin-bottom:28px;">'
        f'<div style="font-size:14px;font-weight:700;color:#1F2854;">Your access is ready</div>'
        f'<div style="font-size:13px;color:#475569;margin-top:4px;">'
        f'Sign in with this email address to get started.</div>'
        f'</div>'
        f'<table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">'
        f'<tr><td style="background:#1F2854;border-radius:8px;padding:12px 26px;">'
        f'<a href="{invite_link}" style="font-size:14px;font-weight:700;'
        f'color:#ffffff;text-decoration:none;">Set Up Your Account &#8594;</a>'
        f'</td></tr></table>'
        f'<p style="font-size:14px;color:#475569;margin:0;">Best regards,<br>'
        f'<strong style="color:#1e293b;">The SmartRisk Team</strong></p>'
        f'</td></tr>'
    )
    params: resend.Emails.SendParams = {
        "from":    settings.RESEND_FROM_EMAIL,
        "to":      [to],
        "subject": f"You've been added to {workspace_name} on SmartRisk",
        "html":    _ext_wrap(workspace_name, body),
    }
    resend.Emails.send(params)
    logger.info("Invite email sent | to=%s | workspace=%s", to, workspace_name)


def send_reset_email(to: str, reset_link: str) -> None:
    """Password reset email. Link expires in 15 minutes."""
    _init()
    if not settings.RESEND_FROM_EMAIL:
        raise ValueError("RESEND_FROM_EMAIL is not configured")
    body = (
        f'<tr><td style="padding:36px;">'
        f'<p style="font-size:15px;color:#1e293b;margin:0 0 16px;">Hi there,</p>'
        f'<p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 24px;">'
        f'We received a request to reset your SmartRisk Pulse password. '
        f'Click the button below to set a new password. '
        f'This link expires in <strong>15 minutes</strong>.</p>'
        f'<table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">'
        f'<tr><td style="background:#1F2854;border-radius:8px;padding:12px 26px;">'
        f'<a href="{reset_link}" style="font-size:14px;font-weight:700;'
        f'color:#ffffff;text-decoration:none;">Reset Password &#8594;</a>'
        f'</td></tr></table>'
        f'<p style="font-size:13px;color:#94a3b8;margin:0 0 16px;">'
        f'If you did not request this, you can safely ignore this email.</p>'
        f'<p style="font-size:14px;color:#475569;margin:0;">Best regards,<br>'
        f'<strong style="color:#1e293b;">The SmartRisk Team</strong></p>'
        f'</td></tr>'
    )
    params: resend.Emails.SendParams = {
        "from":    settings.RESEND_FROM_EMAIL,
        "to":      [to],
        "subject": "Reset your SmartRisk Pulse password",
        "html":    _ext_wrap("SmartRisk Pulse", body),
    }
    resend.Emails.send(params)
    logger.info("Reset email sent | to=%s", to)


async def send_brief_email(
    to: str,
    bcc: list[str],
    subject: str,
    html: str,
) -> None:
    """
    Send the brief via Resend. Non-blocking: caller wraps in try/except.
    Source: BriefEmailService.gs GmailApp.sendEmail pattern.
    """
    _init()
    if not settings.RESEND_FROM_EMAIL:
        raise ValueError("RESEND_FROM_EMAIL is not configured")

    params: resend.Emails.SendParams = {
        "from":    settings.RESEND_FROM_EMAIL,
        "to":      [to],
        "subject": subject,
        "html":    html,
    }
    if bcc:
        params["bcc"] = bcc  # type: ignore[typeddict-unknown-key]

    resend.Emails.send(params)
    logger.info("Brief email sent | to=%s | subject=%s", to, subject)