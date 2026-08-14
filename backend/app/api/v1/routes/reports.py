# app/api/v1/routes/reports.py

import logging
from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, get_active_tenant, require_permission
from app.models.tenant import Tenant
from app.schemas.report import (
    ReportPreviewRequest,
    AIReportRequest,
    ReportExportRequest,
    ReportEmailRequest,
    TemplateSaveRequest,
    ReportSettingsSaveRequest,
)
from app.services import report as report_service
from app.services import ai_report as ai_report_service
from app.services import pdf_report
from app.services import email as email_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports", tags=["reports"])


def _parse_date(val: str | None) -> date | None:
    if not val:
        return None
    try:
        return datetime.fromisoformat(val).date()
    except (ValueError, TypeError):
        return None


async def _get_tenant_name(db: AsyncSession, tenant_id: UUID) -> tuple[str, str]:
    """Returns (org_name, industry) from the Tenant row."""
    result = await db.get(Tenant, tenant_id)
    name     = (result.name     if result else "") or "the organization"  # type: ignore[union-attr]
    industry = (result.industry if result else "") or ""                  # type: ignore[union-attr]
    return name, industry


# ── Preview ────────────────────────────────────────────────────────────────────

@router.post("/preview")
async def preview_report(
    payload: ReportPreviewRequest,
    db:      AsyncSession = Depends(get_db),
    claims:  dict         = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])
    date_from = _parse_date(payload.date_from)
    date_to   = _parse_date(payload.date_to) or date.today()

    try:
        result = await report_service.get_report_data(
            db, tenant_id, payload.blocks, date_from, date_to
        )
        return {"data": result, "error": None, "meta": {}}
    except Exception as exc:
        logger.error("preview_report failed | tenant=%s | %s", tenant_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Report preview failed. Please try again.")


# ── AI narrative ───────────────────────────────────────────────────────────────

@router.post("/ai-narrative")
async def generate_ai_narrative(
    payload: AIReportRequest,
    db:      AsyncSession = Depends(get_db),
    claims:  dict         = Depends(require_permission("generate_ai")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    date_from = _parse_date(payload.date_from)
    date_to   = _parse_date(payload.date_to) or date.today()

    # Fetch supporting block data needed by AI prompts
    supporting = [
        "exposure-index", "risk-snapshot", "key-risk-changes", "incident-stability",
        "top-risks", "top-emerging-risks", "major-incidents", "recommendations",
    ]
    all_blocks = list({*supporting, *payload.blocks})

    try:
        data_result = await report_service.get_report_data(
            db, tenant_id, all_blocks, date_from, date_to
        )
        org_name, industry = await _get_tenant_name(db, tenant_id)
        ai_data = await ai_report_service.generate_report_narrative(
            db=db,
            tenant_id=tenant_id,
            block_data=data_result["block_data"],
            blocks=payload.blocks,
            org_name=org_name,
            industry=industry,
        )
        return {"data": {"ai_data": ai_data}, "error": None, "meta": {}}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("generate_ai_narrative failed | tenant=%s | %s", tenant_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="AI narrative generation failed. Please try again.")


# ── Export PDF ─────────────────────────────────────────────────────────────────

@router.post("/export")
async def export_report(
    payload: ReportExportRequest,
    db:      AsyncSession = Depends(get_db),
    claims:  dict         = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])

    try:
        settings_dict = payload.settings.model_dump()
        _org, _ = await _get_tenant_name(db, tenant_id)
        pdf_bytes = pdf_report.build_pdf(
            blocks=payload.blocks,
            block_data=payload.block_data,
            ai_data=payload.ai_data,
            settings_p=settings_dict,
            date_from=payload.date_from,
            date_to=payload.date_to,
            orientation=payload.orientation,
            org_name=_org,
        )
        import base64
        title    = payload.settings.report_title or "SmartRisk_Report"
        filename = title.replace(" ", "_") + ".pdf"
        return {
            "data": {
                "pdf_base64": base64.b64encode(pdf_bytes).decode(),
                "file_name":  filename,
            },
            "error": None,
            "meta":  {},
        }
    except Exception as exc:
        logger.error("export_report failed | tenant=%s | %s", tenant_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="PDF export failed. Please try again.")


# ── Email report ───────────────────────────────────────────────────────────────

@router.post("/email")
async def email_report(
    payload: ReportEmailRequest,
    db:      AsyncSession = Depends(get_db),
    claims:  dict         = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])
    if not payload.to:
        raise HTTPException(status_code=400, detail="Recipient email is required.")

    try:
        settings_dict = payload.settings.model_dump()
        title    = payload.settings.report_title or "SmartRisk Report"
        filename = title.replace(" ", "_") + ".pdf"

        _org, _ = await _get_tenant_name(db, tenant_id)
        pdf_bytes = pdf_report.build_pdf(
            blocks=payload.blocks,
            block_data=payload.block_data,
            ai_data=payload.ai_data,
            settings_p=settings_dict,
            date_from=payload.date_from,
            date_to=payload.date_to,
            org_name=_org,
        )
        await email_service.send_report_email(
            to=payload.to,
            subject=payload.subject or "SmartRisk Report",
            title=title,
            block_data=payload.block_data,
            pdf_bytes=pdf_bytes,
            file_name=filename,
        )
        return {"data": {"sent": True}, "error": None, "meta": {}}
    except ValueError as exc:
        logger.error("email_report ValueError | tenant=%s | %s", tenant_id, exc, exc_info=True)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("email_report failed | tenant=%s | %s", tenant_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to send report email. Please try again.")


# ── Templates ──────────────────────────────────────────────────────────────────

@router.get("/templates")
async def list_templates(
    db:     AsyncSession = Depends(get_db),
    claims: dict         = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])
    try:
        templates = await report_service.list_templates(db, tenant_id)
        return {"data": {"templates": templates}, "error": None, "meta": {}}
    except Exception as exc:
        logger.error("list_templates failed | tenant=%s | %s", tenant_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to load templates.")


@router.post("/templates")
async def save_template(
    payload: TemplateSaveRequest,
    db:      AsyncSession = Depends(get_db),
    claims:  dict         = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])
    try:
        result = await report_service.save_template(
            db, tenant_id, payload.model_dump(), claims["email"]
        )
        return {"data": result, "error": None, "meta": {}}
    except Exception as exc:
        logger.error("save_template failed | tenant=%s | %s", tenant_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save template.")


@router.get("/templates/{template_id}")
async def get_template(
    template_id: str,
    db:          AsyncSession = Depends(get_db),
    claims:      dict         = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])
    template  = await report_service.get_template(db, tenant_id, template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"Template {template_id} not found.")
    return {"data": {"template": template}, "error": None, "meta": {}}


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: str,
    db:          AsyncSession = Depends(get_db),
    claims:      dict         = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])
    deleted   = await report_service.delete_template(db, tenant_id, template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Template {template_id} not found.")
    return {"data": {"deleted": True}, "error": None, "meta": {}}


@router.post("/templates/{template_id}/default")
async def set_default_template(
    template_id: str,
    report_type: str = "",
    db:          AsyncSession = Depends(get_db),
    claims:      dict         = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])
    ok = await report_service.set_default_template(db, tenant_id, template_id, report_type)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Template {template_id} not found.")
    return {"data": {"updated": True}, "error": None, "meta": {}}


# ── Report settings ────────────────────────────────────────────────────────────

@router.get("/settings")
async def get_report_settings(
    db:     AsyncSession = Depends(get_db),
    claims: dict         = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])
    try:
        settings = await report_service.get_report_settings(db, tenant_id)
        return {"data": {"settings": settings}, "error": None, "meta": {}}
    except Exception as exc:
        logger.error("get_report_settings failed | tenant=%s | %s", tenant_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to load report settings.")


@router.post("/settings")
async def save_report_settings_route(
    payload: ReportSettingsSaveRequest,
    db:      AsyncSession = Depends(get_db),
    claims:  dict         = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])
    try:
        await report_service.save_report_settings(
            db, tenant_id, payload.settings.model_dump()
        )
        return {"data": {"saved": True}, "error": None, "meta": {}}
    except Exception as exc:
        logger.error("save_report_settings failed | tenant=%s | %s", tenant_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save report settings.")