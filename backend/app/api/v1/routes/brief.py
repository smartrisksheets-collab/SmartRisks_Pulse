# app/api/v1/routes/brief.py
# GET /brief/preview — build payload without sending (Owner/Manager only).
# POST /brief/send-test — build + send to a provided email address.

import logging
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_active_tenant, get_db, require_permission
from app.schemas.brief import BriefPayload, SendTestBriefRequest
from app.services.brief import build_brief_payload
from app.services.email import build_brief_html, build_brief_subject, send_brief_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/brief", tags=["brief"])


@router.get("/preview")
async def preview_brief(
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(require_permission("manage_risks")),
) -> dict:
    """
    Build and return the current brief payload without sending an email.
    Used by the frontend Send Test Brief flow to confirm payload before sending.
    """
    tenant_id  = UUID(claims["active_tenant_id"])
    user_email = str(claims.get("email") or "")
    payload    = await build_brief_payload(db, tenant_id, user_email)
    return {"data": payload.model_dump(), "error": None, "meta": {}}


@router.post("/send-test")
async def send_test_brief(
    body: SendTestBriefRequest,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(require_permission("manage_settings")),
) -> dict:
    """
    Build and send the brief to a single address for testing.
    The role check uses the risks permission — Owners and Managers only.
    Non-blocking email failure: returns ok=false with reason rather than 500.
    """
    tenant_id = UUID(claims["active_tenant_id"])
    payload   = await build_brief_payload(db, tenant_id, body.to_email, force_enabled=True)

    if not payload.ok or payload.skip:
        reason = payload.reason or "Brief is disabled or workspace not found."
        return {"data": {"ok": False, "reason": reason}, "error": None, "meta": {}}

    html    = build_brief_html(payload)
    subject = "[TEST] " + build_brief_subject(payload)

    try:
        await send_brief_email(to=body.to_email, bcc=[], subject=subject, html=html)
    except Exception as exc:
        logger.warning("Test brief send failed: %s", exc)
        return {"data": {"ok": False, "reason": str(exc)}, "error": None, "meta": {}}

    return {"data": {"ok": True}, "error": None, "meta": {}}