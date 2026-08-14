# app/schemas/brief.py
# Pydantic schemas for the Risk Brief engine (Phase 10).
# Derived from BriefService.gs api_buildBriefPayload() return structure.

from pydantic import BaseModel


class SignalRow(BaseModel):
    type: str
    exposure_delta: float | None = None
    exposure_driver: str | None = None
    failed_controls: int | None = None
    incident_count: int | None = None
    incident_area: str | None = None


class BriefTableRow(BaseModel):
    id: str
    description: str
    level: str | None = None
    delta: float | None = None
    days_logged: int | None = None
    days_since_review: int | None = None
    action: str | None = None


class BriefTables(BaseModel):
    volatile: list[BriefTableRow] = []
    high_critical: list[BriefTableRow] = []
    stale: list[BriefTableRow] = []


class OutreachItem(BaseModel):
    owner_name: str
    risk_id: str | None = None
    reason: str
    message: str
    mailto: str | None = None


class DailyException(BaseModel):
    is_empty: bool
    empty_message: str | None = None
    item_count: int = 0


class WeeklyDigest(BaseModel):
    health_wow: float = 0.0
    health_now: float = 0.0
    health_prev: float = 0.0
    top_movers_count: int = 0
    overdue_reviews_count: int = 0
    overdue_actions_count: int = 0


class BriefReader(BaseModel):
    first_name: str
    email: str


class BriefMeta(BaseModel):
    cadence_sections: list[str]
    workspace_name: str
    is_warming_up: bool
    generated_at: str


class BriefPayload(BaseModel):
    ok: bool
    skip: bool = False
    reason: str | None = None
    reader: BriefReader | None = None
    meta: BriefMeta | None = None
    greeting: str | None = None
    residual_change_summary: str | None = None
    critical_count: int = 0
    signal_rows: list[SignalRow] = []
    recommended_action: str | None = None
    tables: BriefTables | None = None
    outreach: list[OutreachItem] = []
    daily_exception: DailyException | None = None
    weekly: WeeklyDigest | None = None


class SendTestBriefRequest(BaseModel):
    to_email: str