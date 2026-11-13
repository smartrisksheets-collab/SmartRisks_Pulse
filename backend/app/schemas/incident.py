# app/schemas/incident.py

from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, Field, field_validator

from app.schemas.risk import TITLE_MAX
from app.services.incident_status import (
    CONTROL_OUTCOMES,
    IMPACT_CONFIDENCE,
    STAGES,
    is_valid_status,
    normalise_status,
)

# Severity is checked against the workspace's configured levels in the service,
# never against a fixed list here (SETUP section 35).


def _check_status(v: str | None) -> str | None:
    if v is None:
        return None
    if not is_valid_status(str(v)):
        raise ValueError(f'status must be one of {list(STAGES)}')
    return normalise_status(str(v))


def _check_outcome(v: str | None) -> str | None:
    if v is None or str(v).strip() == '':
        return None
    if v not in CONTROL_OUTCOMES:
        raise ValueError(f'control_outcome must be one of {list(CONTROL_OUTCOMES)}')
    return str(v)


def _check_confidence(v: str | None) -> str | None:
    if v is None or str(v).strip() == '':
        return None
    if v not in IMPACT_CONFIDENCE:
        raise ValueError(f'impact_confidence must be one of {list(IMPACT_CONFIDENCE)}')
    return str(v)


def _blank_title(v: str | None) -> str | None:
    if v is None:
        return None
    t = ' '.join(str(v).split())
    return t or None


class IncidentCreate(BaseModel):
    description: str
    category: str
    severity: str = 'Medium'
    reported_by: str
    reported_at: date
    title: str | None = Field(default=None, max_length=TITLE_MAX)
    priority: str | None = None
    status: str | None = 'New'
    root_cause: str | None = None
    assigned_to: str | None = None
    reporter_email: str | None = None
    channel: str | None = None
    incident_type: str | None = None
    incident_dt: datetime | None = None
    location: str | None = None
    impact_summary: str | None = None
    affected_asset: str | None = None
    business_unit: str | None = None
    linked_risk_id: str | None = None
    linked_control: str | None = None
    control_outcome: str | None = None
    impact_confidence: str | None = None
    immediate_actions: str | None = None
    evidence_link: str | None = None
    analyst_notes: str | None = None
    containment_date: date | None = None
    tags: str | None = None
    review_status: str | None = None
    risk_impacted: str | None = None
    resolution_summary: str | None = None
    financial_impact: Decimal | None = None
    resolved_at: datetime | None = None

    @field_validator('description', 'category', 'reported_by', mode='before')
    @classmethod
    def strip_and_require(cls, v: str) -> str:
        v = str(v).strip()
        if not v:
            raise ValueError('Field cannot be empty')
        return v

    @field_validator('severity', mode='before')
    @classmethod
    def strip_severity(cls, v: str) -> str:
        v = str(v).strip()
        if not v:
            raise ValueError('Severity cannot be empty')
        return v

    @field_validator('status', mode='before')
    @classmethod
    def validate_status(cls, v: str | None) -> str | None:
        return _check_status(v) or 'New'

    @field_validator('title', mode='before')
    @classmethod
    def clean_title(cls, v: str | None) -> str | None:
        return _blank_title(v)

    @field_validator('control_outcome', mode='before')
    @classmethod
    def validate_outcome(cls, v: str | None) -> str | None:
        return _check_outcome(v)

    @field_validator('impact_confidence', mode='before')
    @classmethod
    def validate_confidence(cls, v: str | None) -> str | None:
        return _check_confidence(v)


class IncidentUpdate(BaseModel):
    """Partial update. Only fields sent are changed; null clears an optional field."""
    title: str | None = Field(default=None, max_length=TITLE_MAX)
    description: str | None = None
    category: str | None = None
    severity: str | None = None
    priority: str | None = None
    status: str | None = None
    root_cause: str | None = None
    assigned_to: str | None = None
    reported_by: str | None = None
    reported_at: date | None = None
    reporter_email: str | None = None
    channel: str | None = None
    incident_type: str | None = None
    incident_dt: datetime | None = None
    location: str | None = None
    impact_summary: str | None = None
    affected_asset: str | None = None
    business_unit: str | None = None
    linked_risk_id: str | None = None
    linked_control: str | None = None
    control_outcome: str | None = None
    impact_confidence: str | None = None
    immediate_actions: str | None = None
    evidence_link: str | None = None
    analyst_notes: str | None = None
    containment_date: date | None = None
    tags: str | None = None
    review_status: str | None = None
    risk_impacted: str | None = None
    resolution_summary: str | None = None
    financial_impact: Decimal | None = None
    resolved_at: datetime | None = None

    @field_validator('status', mode='before')
    @classmethod
    def validate_status(cls, v: str | None) -> str | None:
        return _check_status(v)

    @field_validator('title', mode='before')
    @classmethod
    def clean_title(cls, v: str | None) -> str | None:
        return _blank_title(v)

    @field_validator('description', 'category', 'reported_by', 'severity', mode='before')
    @classmethod
    def strip_required(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = str(v).strip()
        if not v:
            raise ValueError('Field cannot be empty')
        return v

    @field_validator('control_outcome', mode='before')
    @classmethod
    def validate_outcome(cls, v: str | None) -> str | None:
        return _check_outcome(v)

    @field_validator('impact_confidence', mode='before')
    @classmethod
    def validate_confidence(cls, v: str | None) -> str | None:
        return _check_confidence(v)


class IncidentResponse(BaseModel):
    id: str
    tenant_id: UUID
    title: str | None
    description: str | None
    category: str | None
    severity: str | None
    priority: str | None
    status: str | None
    root_cause: str | None
    assigned_to: str | None
    reported_by: str | None
    reported_at: date | None
    reporter_email: str | None
    channel: str | None
    incident_type: str | None
    incident_dt: datetime | None
    location: str | None
    impact_summary: str | None
    affected_asset: str | None
    business_unit: str | None
    linked_risk_id: str | None
    linked_control: str | None
    control_outcome: str | None
    impact_confidence: str | None
    immediate_actions: str | None
    evidence_link: str | None
    analyst_notes: str | None
    containment_date: date | None
    tags: str | None
    review_status: str | None
    risk_impacted: str | None
    resolution_summary: str | None
    financial_impact: Decimal | None
    resolved_at: datetime | None
    ai_impact: str | None
    ai_actions: str | None
    ai_status: str | None
    ai_last_generated: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {'from_attributes': True}


class IncidentRow(IncidentResponse):
    """An incident with the labels the log and panel show, all computed in the backend."""
    display_title: str
    is_open: bool
    is_high: bool
    target_state: str           # due | due_today | missed | met | none
    target_text: str
    resolve_by: date | None
    target_days: int
    link_state: str             # linked | unlinked | uncovered
    linked_risk_title: str | None = None


class IncidentListResponse(BaseModel):
    items: list[IncidentRow]
    total: int
    page: int
    page_size: int


# Stat card shapes, mirrors api_getIncidentCards in View_Incidents.html
class HealthComponent(BaseModel):
    name: str
    weight: int
    score: int
    suppressed: bool = False

class IncidentHealth(BaseModel):
    score: int
    label: str
    within_sla: int
    within_sla_total: int
    open_past_target: int
    linked: int
    total: int
    flag: str | None = None
    components: list[HealthComponent] = []
    small_n: bool = False

class IncidentTotals(BaseModel):
    count: int
    open_count: int
    overdue_count: int
    high_or_above: int
    open_over_150d: int = 0
    flag: str | None = None

class IncidentLifecycle(BaseModel):
    new: int
    triaged: int
    investigating: int
    remediating: int
    resolved: int
    closed: int
    oldest_open_days: int | None = None

class IncidentResolution(BaseModel):
    oldest_open_days: int | None = None
    oldest_open_id: str | None = None
    oldest_open_severity: str | None = None
    oldest_open_date: str | None = None
    median_days: float | None = None
    resolved_count: int = 0
    breach_count: int = 0
    breach_total: int = 0
    impact_total: Decimal = Decimal('0')
    impact_count: int = 0
    impact_total_count: int = 0
    flag: str | None = None

class MonthlyTrend(BaseModel):
    month: str
    count: int

class TopDriver(BaseModel):
    id: str
    title: str | None = None
    severity: str | None = None
    age_days: int
    category: str | None = None
    status: str | None = None

class IncidentInsightAction(BaseModel):
    badge: str
    text: str

class IncidentPageInsightResponse(BaseModel):
    actions: list[IncidentInsightAction]

class SeverityPerformance(BaseModel):
    severity: str
    target_days: int
    open: int = 0
    resolved: int = 0
    met: int = 0
    median_days: float | None = None

class IncidentCost(BaseModel):
    id: str
    title: str | None = None
    amount: Decimal
    confidence: str | None = None

class CategoryDriver(BaseModel):
    category: str
    count: int = 0
    open: int = 0
    unlinked_ids: list[str] = []

class IncidentStatsResponse(BaseModel):
    health: IncidentHealth
    totals: IncidentTotals
    lifecycle: IncidentLifecycle
    resolution: IncidentResolution
    monthly_trend: list[MonthlyTrend] = []
    top_drivers: list[TopDriver] = []
    by_severity: list[SeverityPerformance] = []
    costs: list[IncidentCost] = []
    by_category: list[CategoryDriver] = []


class AIIncidentRequest(BaseModel):
    force: bool = False


class AIIncidentSuggestRequest(BaseModel):
    description: str

    @field_validator('description', mode='before')
    @classmethod
    def strip_and_require(cls, v: str) -> str:
        v = str(v).strip()
        if len(v) < 10:
            raise ValueError('description must be at least 10 characters')
        return v


class AIIncidentResponse(BaseModel):
    mode: str
    incident_id: str
    text: str

class AIIncidentSuggestResponse(BaseModel):
    suggestion: str

# ── UI step 6: quick views, panel context, target preview ────────────────────

class IncidentViewCounts(BaseModel):
    open: int
    unlinked: int
    high: int
    resolved: int
    all: int
    high_label: str             # how the top severities read, e.g. "High or above"
    summary: str                # one sentence about the whole log, unfiltered
    owners: list[str]           # distinct owners for the filter


class IncidentStep(BaseModel):
    name: str
    state: str                  # done | current | todo


class IncidentRiskRef(BaseModel):
    id: str
    title: str
    residual: int | None = None
    on_register: bool = True


class IncidentHistoryItem(BaseModel):
    at: datetime
    user: str | None
    action: str | None
    summary: str | None


class IncidentContext(BaseModel):
    incident: IncidentRow
    steps: list[IncidentStep]
    stage_note: str
    next_status: str | None
    next_label: str | None
    linked_risk: IncidentRiskRef | None
    covered: bool
    link_note: str
    suggested_risks: list[IncidentRiskRef]
    history: list[IncidentHistoryItem]


class TargetPreviewRequest(BaseModel):
    severity: str
    reported_at: date | None = None
    category: str | None = None
    linked_risk_id: str | None = None


class TargetPreviewResponse(BaseModel):
    severity: str
    target_hours: float
    target_days: int
    resolve_by: date | None
    due_note: str
    covered: bool
    suggested_risks: list[IncidentRiskRef]
    outcomes: list[str]
