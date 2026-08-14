# app/services/settings.py

import time
import uuid
from typing import TypedDict
from uuid import UUID

import httpx

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    PermissionDeniedError,
    ResourceNotFoundError,
    ValidationError,
)
from app.core.config import settings
from app.core.security import hash_pin
from app.models.notification_pref import NotificationPref
from app.models.tenant import Tenant
from app.schemas.settings import (
    NotificationPrefResponse,
    NotificationPrefUpdate,
    PINSet,
    SettingsResponse,
    SettingsUpdate,
)

# ── defaults mirror GAS api_getWorkspaceSettings defaults ───────────────
_DEFAULTS: dict = {
    "organization": "",
    "framework": "ISO 31000",
    "timezone": "UTC",
    "date_format": "YYYY-MM-DD",
    "primary_color": "#01b88e",
    "accent_color": "#1F2854",
    "theme_mode": "light",
    "roles_default_role": "Analyst",
    "roles_access_mode": "internal",
    "perm_owner_risks": True,
    "perm_mgr_risks": True,
    "perm_analyst_risks": False,
    "perm_owner_inc": True,
    "perm_mgr_inc": True,
    "perm_analyst_inc": True,
    "perm_owner_ai": True,
    "perm_mgr_ai": True,
    "perm_analyst_ai": False,
    "perm_owner_print": True,
    "perm_mgr_print": True,
    "perm_analyst_print": True,
    "perm_owner_users": True,
    "perm_mgr_users": False,
    "perm_analyst_users": False,
    "ai_enabled": "on",
    "ai_model": "claude-sonnet-4-6",
    "ai_confidence": "balanced",
    "ai_auto_run": "no",
    "ai_policy": "",
    "ai_policy_industry": "",
    "ai_policy_tone": "",
    "ai_policy_sensitivity": "",
    "ai_policy_extra": "",
    "alert_high_threshold": 10,
    "alert_very_high_threshold": 17,
    "alert_incident_notify": "yes",
    "alert_resolved_notify": "no",
    "alert_recipients": "",
    "alert_digest": "off",
    "alert_digest_time": "09:00",
    "brief_enabled": "off",
    "brief_send_time": "08:00",
    "brief_recipients": "",
    "brief_weekly_enabled": True,
    "brief_monthly_enabled": True,
    "brief_quarterly_enabled": True,
    "brief_stale_threshold": 30,
    "brief_testing_interval": 90,
    "brief_outreach_cap": 5,
}


class AIConfig(TypedDict):
    enabled: bool
    model: str
    confidence: str
    policy: str
    auto_run: bool


async def get_ai_config(db: AsyncSession, tenant_id: UUID) -> AIConfig:
    """Read workspace AI settings from JSONB. Never raises. Falls back to defaults."""
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    ws: dict = dict(tenant.workspace_settings or {}) if tenant else {}  # type: ignore[arg-type]
    return {
        "enabled":    str(ws.get("ai_enabled",    "on"))       == "on",
        "model":      str(ws.get("ai_model",      "claude-sonnet-4-6")),
        "confidence": str(ws.get("ai_confidence", "balanced")),
        "policy":     str(ws.get("ai_policy",     "")),
        "auto_run":   str(ws.get("ai_auto_run",   "no"))       == "yes",
    }


async def _get_tenant(db: AsyncSession, tenant_id: UUID) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise ResourceNotFoundError("Workspace not found")
    return tenant


def _build_response(tenant: Tenant) -> SettingsResponse:
    ws: dict = dict(tenant.workspace_settings or {})  # type: ignore[arg-type]

    def _b(key: str) -> bool:
        return bool(ws.get(key, _DEFAULTS.get(key, False)))

    def _s(key: str) -> str:
        return str(ws.get(key, _DEFAULTS.get(key, "")))

    def _i(key: str) -> int:
        return int(ws.get(key, _DEFAULTS.get(key, 0)))

    return SettingsResponse(
        name=str(tenant.name or "SmartRisk"),
        organization=_s("organization"),
        industry=str(tenant.industry or ""),
        framework=_s("framework"),
        timezone=_s("timezone"),
        date_format=_s("date_format"),
        currency_symbol=str(tenant.currency_symbol or "₦"),
        logo_url=str(tenant.logo_url) if tenant.logo_url else None, # type: ignore
        primary_color=_s("primary_color"),
        accent_color=_s("accent_color"),
        theme_mode=_s("theme_mode"),
        roles_default_role=_s("roles_default_role"),
        roles_access_mode=_s("roles_access_mode"),
        perm_owner_risks=_b("perm_owner_risks"),
        perm_mgr_risks=_b("perm_mgr_risks"),
        perm_analyst_risks=_b("perm_analyst_risks"),
        perm_owner_inc=_b("perm_owner_inc"),
        perm_mgr_inc=_b("perm_mgr_inc"),
        perm_analyst_inc=_b("perm_analyst_inc"),
        perm_owner_ai=_b("perm_owner_ai"),
        perm_mgr_ai=_b("perm_mgr_ai"),
        perm_analyst_ai=_b("perm_analyst_ai"),
        perm_owner_print=_b("perm_owner_print"),
        perm_mgr_print=_b("perm_mgr_print"),
        perm_analyst_print=_b("perm_analyst_print"),
        perm_owner_users=_b("perm_owner_users"),
        perm_mgr_users=_b("perm_mgr_users"),
        perm_analyst_users=_b("perm_analyst_users"),
        ai_enabled=_s("ai_enabled"),
        ai_model=_s("ai_model"),
        ai_confidence=_s("ai_confidence"),
        ai_auto_run=_s("ai_auto_run"),
        ai_policy=_s("ai_policy"),
        ai_policy_industry=_s("ai_policy_industry"),
        ai_policy_tone=_s("ai_policy_tone"),
        ai_policy_sensitivity=_s("ai_policy_sensitivity"),
        ai_policy_extra=_s("ai_policy_extra"),
        alert_high_threshold=_i("alert_high_threshold"),
        alert_very_high_threshold=_i("alert_very_high_threshold"),
        alert_incident_notify=_s("alert_incident_notify"),
        alert_resolved_notify=_s("alert_resolved_notify"),
        alert_recipients=_s("alert_recipients"),
        alert_digest=_s("alert_digest"),
        alert_digest_time=_s("alert_digest_time"),
        brief_enabled=_s("brief_enabled"),
        brief_send_time=_s("brief_send_time"),
        brief_recipients=_s("brief_recipients"),
        brief_weekly_enabled=_b("brief_weekly_enabled"),
        brief_monthly_enabled=_b("brief_monthly_enabled"),
        brief_quarterly_enabled=_b("brief_quarterly_enabled"),
        brief_stale_threshold=_i("brief_stale_threshold"),
        brief_testing_interval=_i("brief_testing_interval"),
        brief_outreach_cap=_i("brief_outreach_cap"),
        plan=str(tenant.plan),
        plan_expires_at=tenant.plan_expires_at,  # type: ignore[arg-type]
        modules=list(tenant.modules or []),  # type: ignore[arg-type]
        max_risks=int(tenant.max_risks or 1000),  # type: ignore[arg-type]
        max_users=int(tenant.max_users or 25),  # type: ignore[arg-type]
        has_pin=bool(tenant.pin_hash),
    )


async def _delete_logo_from_storage(logo_url: str) -> None:
    prefix = f"{settings.SUPABASE_URL}/storage/v1/object/public/workspace-logos/"
    if not logo_url.startswith(prefix):
        return
    path = logo_url[len(prefix):]
    url = f"{settings.SUPABASE_URL}/storage/v1/object/workspace-logos/{path}"
    headers = {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_KEY,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.delete(url, headers=headers)
    except Exception:
        pass  # best-effort, never block the upload


async def upload_logo(
    file_content: bytes,
    content_type: str,
    filename: str,
    old_logo_url: str | None = None,
) -> str:
    if old_logo_url:
        await _delete_logo_from_storage(old_logo_url)
    safe_name = filename.replace(" ", "_")
    path = f"logos/{int(time.time() * 1000)}_{safe_name}"
    url = f"{settings.SUPABASE_URL}/storage/v1/object/workspace-logos/{path}"
    headers = {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_KEY,
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, content=file_content, headers=headers)
        resp.raise_for_status()
    return f"{settings.SUPABASE_URL}/storage/v1/object/public/workspace-logos/{path}"


async def get_settings(db: AsyncSession, tenant_id: UUID) -> SettingsResponse:
    tenant = await _get_tenant(db, tenant_id)
    return _build_response(tenant)


async def update_settings(
    db: AsyncSession, tenant_id: UUID, payload: SettingsUpdate
) -> SettingsResponse:
    tenant = await _get_tenant(db, tenant_id)

    # --- update top-level columns if provided ---
    updates = payload.model_dump(exclude_none=True)

    if "name" in updates:
        name = str(updates.pop("name")).strip()
        if not name:
            raise ValidationError("Workspace name is required")
        tenant.name = name  # type: ignore[assignment]

    if "industry" in updates:
        tenant.industry = str(updates.pop("industry"))  # type: ignore[assignment]

    if "currency_symbol" in updates:
        tenant.currency_symbol = str(updates.pop("currency_symbol"))  # type: ignore[assignment]

    if "logo_url" in updates:
        tenant.logo_url = updates.pop("logo_url")  # type: ignore[assignment]

    # --- merge remaining fields into workspace_settings JSONB ---
    if updates:
        existing: dict = dict(tenant.workspace_settings or {})  # type: ignore[arg-type]
        existing.update(updates)
        tenant.workspace_settings = existing  # type: ignore[assignment]
        # bump perm_version so the next token refresh picks up the new matrix
        if any(k.startswith("perm_") for k in updates):
            tenant.perm_version = int(tenant.perm_version or 1) + 1  # type: ignore[assignment]

    await db.flush()
    await db.refresh(tenant)
    return _build_response(tenant)


async def set_pin(
    db: AsyncSession, tenant_id: UUID, payload: PINSet
) -> dict:
    tenant = await _get_tenant(db, tenant_id)
    tenant.pin_hash = hash_pin(payload.new_pin)  # type: ignore[assignment]
    tenant.pin_attempts = 0  # type: ignore[assignment]
    tenant.pin_locked_until = None  # type: ignore[assignment]
    await db.flush()
    return {"has_pin": True}


async def remove_pin(db: AsyncSession, tenant_id: UUID, role: str) -> dict:
    if role != "Owner":
        raise PermissionDeniedError("Only the workspace Owner can remove the PIN")
    tenant = await _get_tenant(db, tenant_id)
    tenant.pin_hash = None  # type: ignore[assignment]
    tenant.pin_attempts = 0  # type: ignore[assignment]
    tenant.pin_locked_until = None  # type: ignore[assignment]
    await db.flush()
    return {"has_pin": False}


# ── Notification prefs ───────────────────────────────────────────────────

async def _get_or_create_pref(
    db: AsyncSession, tenant_id: UUID, user_email: str
) -> NotificationPref:
    result = await db.execute(
        select(NotificationPref).where(
            NotificationPref.tenant_id == tenant_id,
            NotificationPref.user_email == user_email.lower(),
        )
    )
    pref = result.scalar_one_or_none()
    if pref is None:
        pref = NotificationPref(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            user_email=user_email.lower(),
            brief_frequency="daily",
            opted_out=False,
        )
        db.add(pref)
        await db.flush()
        await db.refresh(pref)
    return pref


async def get_notification_prefs(
    db: AsyncSession, tenant_id: UUID, user_email: str
) -> NotificationPrefResponse:
    pref = await _get_or_create_pref(db, tenant_id, user_email)
    return NotificationPrefResponse(
        brief_frequency=str(pref.brief_frequency or "daily"),
        opted_out=bool(pref.opted_out),
    )


async def update_notification_prefs(
    db: AsyncSession,
    tenant_id: UUID,
    user_email: str,
    payload: NotificationPrefUpdate,
) -> NotificationPrefResponse:
    pref = await _get_or_create_pref(db, tenant_id, user_email)
    updates = payload.model_dump(exclude_none=True)
    for field, value in updates.items():
        setattr(pref, field, value)
    await db.flush()
    await db.refresh(pref)
    return NotificationPrefResponse(
        brief_frequency=str(pref.brief_frequency or "daily"),
        opted_out=bool(pref.opted_out),
    )