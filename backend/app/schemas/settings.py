# app/schemas/settings.py

import re
from datetime import date

from pydantic import BaseModel, field_validator


class SettingsResponse(BaseModel):
    # Identity (top-level tenant columns + JSONB)
    name: str
    organization: str
    industry: str
    framework: str
    timezone: str
    date_format: str
    currency_symbol: str
    logo_url: str | None

    # Brand (JSONB)
    primary_color: str
    accent_color: str
    theme_mode: str

    # Roles (JSONB)
    roles_default_role: str
    roles_access_mode: str
    perm_owner_risks: bool
    perm_mgr_risks: bool
    perm_analyst_risks: bool
    perm_owner_inc: bool
    perm_mgr_inc: bool
    perm_analyst_inc: bool
    perm_owner_ai: bool
    perm_mgr_ai: bool
    perm_analyst_ai: bool
    perm_owner_print: bool
    perm_mgr_print: bool
    perm_analyst_print: bool
    perm_owner_users: bool
    perm_mgr_users: bool
    perm_analyst_users: bool

    # AI (JSONB)
    ai_enabled: str
    ai_model: str
    ai_confidence: str
    ai_auto_run: str
    ai_policy: str
    ai_policy_industry: str
    ai_policy_tone: str
    ai_policy_sensitivity: str
    ai_policy_extra: str

    # Alerts (JSONB)
    alert_high_threshold: int
    alert_very_high_threshold: int
    alert_incident_notify: str
    alert_resolved_notify: str
    alert_recipients: str
    alert_digest: str
    alert_digest_time: str

    # Brief (JSONB)
    brief_enabled: str
    brief_send_time: str
    brief_recipients: str
    brief_weekly_enabled: bool
    brief_monthly_enabled: bool
    brief_quarterly_enabled: bool
    brief_stale_threshold: int
    brief_testing_interval: int
    brief_outreach_cap: int

    # Billing (tenant top-level, read-only in this response)
    plan: str
    plan_expires_at: date | None
    modules: list[str]
    max_risks: int
    max_users: int

    # PIN status (never expose the hash)
    has_pin: bool


class SettingsUpdate(BaseModel):
    # Identity
    name: str | None = None
    organization: str | None = None
    industry: str | None = None
    framework: str | None = None
    timezone: str | None = None
    date_format: str | None = None
    currency_symbol: str | None = None
    logo_url: str | None = None

    # Brand
    primary_color: str | None = None
    accent_color: str | None = None
    theme_mode: str | None = None

    # Roles
    roles_default_role: str | None = None
    roles_access_mode: str | None = None
    perm_owner_risks: bool | None = None
    perm_mgr_risks: bool | None = None
    perm_analyst_risks: bool | None = None
    perm_owner_inc: bool | None = None
    perm_mgr_inc: bool | None = None
    perm_analyst_inc: bool | None = None
    perm_owner_ai: bool | None = None
    perm_mgr_ai: bool | None = None
    perm_analyst_ai: bool | None = None
    perm_owner_print: bool | None = None
    perm_mgr_print: bool | None = None
    perm_analyst_print: bool | None = None
    perm_owner_users: bool | None = None
    perm_mgr_users: bool | None = None
    perm_analyst_users: bool | None = None

    # AI
    ai_enabled: str | None = None
    ai_model: str | None = None
    ai_confidence: str | None = None
    ai_auto_run: str | None = None
    ai_policy: str | None = None
    ai_policy_industry: str | None = None
    ai_policy_tone: str | None = None
    ai_policy_sensitivity: str | None = None
    ai_policy_extra: str | None = None

    # Alerts
    alert_high_threshold: int | None = None
    alert_very_high_threshold: int | None = None
    alert_incident_notify: str | None = None
    alert_resolved_notify: str | None = None
    alert_recipients: str | None = None
    alert_digest: str | None = None
    alert_digest_time: str | None = None

    # Brief
    brief_enabled: str | None = None
    brief_send_time: str | None = None
    brief_recipients: str | None = None
    brief_weekly_enabled: bool | None = None
    brief_monthly_enabled: bool | None = None
    brief_quarterly_enabled: bool | None = None
    brief_stale_threshold: int | None = None
    brief_testing_interval: int | None = None
    brief_outreach_cap: int | None = None


class PINSet(BaseModel):
    new_pin: str

    @field_validator("new_pin")
    @classmethod
    def validate_pin(cls, v: str) -> str:
        if not re.match(r"^\d{6}$", v):
            raise ValueError("PIN must be exactly 6 digits")
        return v


class NotificationPrefResponse(BaseModel):
    brief_frequency: str
    opted_out: bool


class NotificationPrefUpdate(BaseModel):
    brief_frequency: str | None = None
    opted_out: bool | None = None