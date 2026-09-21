# app/schemas/incident.py

from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, Field, field_validator

_VALID_SEVERITY = {'Low', 'Medium', 'High', 'Very High'}
_VALID_STATUS = {'New', 'Open', 'In Progress', 'Under Review', 'Resolved', 'Closed'}


class IncidentCreate(BaseModel):
    description: str
    category: str
    severity: str = 'Medium'
    reported_by: str
    reported_at: date
    title: str | None = None
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
    def validate_severity(cls, v: str) -> str:
        if v not in _VALID_SEVERITY:
            raise ValueError(f'severity must be one of {sorted(_VALID_SEVERITY)}')
        return v

    @field_validator('status', mode='before')
    @classmethod
    def validate_status(cls, v: str | None) -> str | None:
        if v is None:
            return 'New'
        if v not in _VALID_STATUS:
            raise ValueError(f'status must be one of {sorted(_VALID_STATUS)}')
        return v


class IncidentUpdate(BaseModel):
    title: str | None = None
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

    @field_validator('severity', mode='before')
    @classmethod
    def validate_severity(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if v not in _VALID_SEVERITY:
            raise ValueError(f'severity must be one of {sorted(_VALID_SEVERITY)}')
        return v

    @field_validator('status', mode='before')
    @classmethod
    def validate_status(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if v not in _VALID_STATUS:
            raise ValueError(f'status must be one of {sorted(_VALID_STATUS)}')
        return v


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


class IncidentListResponse(BaseModel):
    items: list[IncidentResponse]
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
    open: int
    in_progress: int
    under_review: int
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

class IncidentStatsResponse(BaseModel):
    health: IncidentHealth
    totals: IncidentTotals
    lifecycle: IncidentLifecycle
    resolution: IncidentResolution
    monthly_trend: list[MonthlyTrend] = []
    top_drivers: list[TopDriver] = []


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