# app/schemas/incident_severity.py
from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field, field_validator


class SeverityLevelUpsert(BaseModel):
    id: UUID | None = None
    label: str
    sort_order: int
    color: str = '#64748b'
    criteria_text: str | None = None

    @field_validator('label', mode='before')
    @classmethod
    def strip_label(cls, v: str) -> str:
        v = str(v).strip()
        if not v:
            raise ValueError('label cannot be empty')
        return v

    @field_validator('color', mode='before')
    @classmethod
    def validate_color(cls, v: str) -> str:
        v = str(v).strip()
        if not v.startswith('#') or len(v) not in (4, 7):
            raise ValueError('color must be a hex value like #abc or #aabbcc')
        return v


class SeverityLevelResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    label: str
    sort_order: int
    color: str
    criteria_text: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {'from_attributes': True}


class SlaTargetUpsert(BaseModel):
    severity_id: UUID
    target_value: float = Field(gt=0)
    target_unit: str = 'hours'
    notify_on_log: str | None = None

    @field_validator('target_unit', mode='before')
    @classmethod
    def validate_unit(cls, v: str) -> str:
        if v not in ('hours', 'days'):
            raise ValueError("target_unit must be 'hours' or 'days'")
        return v

    @field_validator('notify_on_log', mode='before')
    @classmethod
    def validate_notify(cls, v: str | None) -> str | None:
        if v is None:
            return None
        valid = {'admin_and_owner', 'owner_only', 'none'}
        if v not in valid:
            raise ValueError(f'notify_on_log must be one of {sorted(valid)}')
        return v


class SlaTargetResponse(BaseModel):
    id: UUID
    severity_id: UUID
    target_value: float
    target_unit: str
    target_hours: float
    notify_on_log: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {'from_attributes': True}


class EscalationRuleUpsert(BaseModel):
    auto_escalate_on_breach: bool = False
    escalate_to: str = 'admin'
    flag_unowned_after_hours: int | None = None

    @field_validator('escalate_to', mode='before')
    @classmethod
    def validate_escalate_to(cls, v: str) -> str:
        valid = {'risk_committee', 'cro', 'admin'}
        if v not in valid:
            raise ValueError(f'escalate_to must be one of {sorted(valid)}')
        return v


class EscalationRuleResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    auto_escalate_on_breach: bool
    escalate_to: str
    flag_unowned_after_hours: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {'from_attributes': True}


class BandMapResponse(BaseModel):
    id: UUID
    severity_id: UUID
    risk_band_label: str
    created_at: datetime

    model_config = {'from_attributes': True}


class IncidentSeverityConfigResponse(BaseModel):
    levels: list[SeverityLevelResponse]
    sla_targets: list[SlaTargetResponse]
    escalation_rules: EscalationRuleResponse | None
    band_map: list[BandMapResponse]


class IncidentBreachPreviewItem(BaseModel):
    incident_id: str
    severity: str
    age_hours: float
    target_hours: float | None
    is_breach: bool


class IncidentBreachPreviewResponse(BaseModel):
    items: list[IncidentBreachPreviewItem]
    breach_count: int
    breach_rate_pct: int
    unowned_count: int