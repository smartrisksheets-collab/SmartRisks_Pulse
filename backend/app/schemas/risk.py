# app/schemas/risk.py

from __future__ import annotations
from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel, Field, field_validator


class RiskCreate(BaseModel):
    category: str
    description: str
    owner: str
    treatment: str
    likelihood: int          = Field(..., ge=1, le=5)
    impact_score: int        = Field(..., ge=1, le=5)
    primary_impact: str | None           = None
    controls: str | None                 = None
    control_effectiveness: int | None    = Field(default=None, ge=0, le=100)
    mitigation_plan: str | None          = None
    comments: str | None                 = None
    ai_insight: str | None               = None
    owner_email: str | None              = None
    target_date: date | None             = None
    mitigation_status: str | None        = 'Open'
    logged_at: date | None               = None
    control_last_tested: date | None     = None
    control_test_result: str | None      = None
    source: str | None                   = None

    @field_validator('category', 'description', 'owner', 'treatment', mode='before')
    @classmethod
    def strip_and_require(cls, v: str) -> str:
        v = str(v).strip()
        if not v:
            raise ValueError('Field cannot be empty')
        return v

    @field_validator('mitigation_status', mode='before')
    @classmethod
    def validate_mitigation_status(cls, v: str | None) -> str:
        if v is None:
            return 'Open'
        allowed = {'Open', 'In Progress', 'Closed', 'Accepted'}
        if v not in allowed:
            raise ValueError(f'mitigation_status must be one of {sorted(allowed)}')
        return v


class RiskUpdate(BaseModel):
    category: str | None                 = None
    description: str | None              = None
    owner: str | None                    = None
    treatment: str | None                = None
    likelihood: int | None               = Field(default=None, ge=1, le=5)
    impact_score: int | None             = Field(default=None, ge=1, le=5)
    primary_impact: str | None           = None
    controls: str | None                 = None
    control_effectiveness: int | None    = Field(default=None, ge=0, le=100)
    mitigation_plan: str | None          = None
    comments: str | None                 = None
    ai_insight: str | None               = None
    owner_email: str | None              = None
    target_date: date | None             = None
    mitigation_status: str | None        = None
    logged_at: date | None               = None
    control_last_tested: date | None     = None
    control_test_result: str | None      = None

    @field_validator('mitigation_status', mode='before')
    @classmethod
    def validate_mitigation_status(cls, v: str | None) -> str | None:
        if v is None:
            return None
        allowed = {'Open', 'In Progress', 'Closed', 'Accepted'}
        if v not in allowed:
            raise ValueError(f'mitigation_status must be one of {sorted(allowed)}')
        return v


class RiskResponse(BaseModel):
    id: str
    tenant_id: UUID
    category: str | None
    description: str | None
    primary_impact: str | None
    owner: str | None
    owner_email: str | None
    logged_at: date | None
    likelihood: int | None
    impact_score: int | None
    severity: float | None
    level:        str | None
    level_index:  int | None = None
    is_elevated:  bool = False
    treatment: str | None
    controls: str | None
    control_effectiveness: int | None
    residual: float | None
    overall_rating: float | None
    mitigation_plan: str | None
    comments: str | None
    ai_insight: str | None
    score_delta: float  = 0.0
    movement: str | None
    freshness: str | None
    target_date: date | None
    mitigation_status: str | None
    last_reviewed_at: datetime | None
    control_last_tested: date | None
    control_test_result: str | None
    source: str = 'internal'
    created_at: datetime
    updated_at: datetime

    model_config = {'from_attributes': True}


class RiskQuotaInfo(BaseModel):
    current: int
    limit: int
    pct: float
    warn: bool   # True when pct >= 80
    full: bool   # True when current >= limit


class RiskListResponse(BaseModel):
    items: list[RiskResponse]
    total: int
    page: int
    page_size: int
    quota: RiskQuotaInfo


_DATE_FORMATS = (
    '%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y',
    '%d-%m-%Y', '%Y/%m/%d', '%d-%b-%Y',
    '%d %b %Y', '%B %d, %Y', '%d %B %Y',
)


class BulkImportRow(BaseModel):
    category: str
    description: str
    owner: str
    treatment: str
    likelihood: int       = Field(..., ge=1, le=5)
    impact_score: int     = Field(..., ge=1, le=5)
    primary_impact: str | None        = None
    controls: str | None              = None
    control_effectiveness: int | None = Field(default=None, ge=0, le=100)
    mitigation_plan: str | None       = None
    comments: str | None              = None
    logged_at: date | None            = None

    @field_validator('category', 'description', 'owner', 'treatment', mode='before')
    @classmethod
    def strip_and_require(cls, v: str) -> str:
        v = str(v).strip()
        if not v:
            raise ValueError('Field cannot be empty')
        return v

    @field_validator('logged_at', mode='before')
    @classmethod
    def parse_logged_at(cls, v: object) -> date | None:
        if v is None:
            return None
        if isinstance(v, date):
            return v
        s = str(v).strip()
        if not s:
            return None
        for fmt in _DATE_FORMATS:
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                continue
        # Excel serial number fallback
        try:
            from datetime import timedelta
            return date(1899, 12, 30) + timedelta(days=int(float(s)))
        except (ValueError, OverflowError, OSError):
            pass
        return None  # unparseable optional field — silently ignore


class BulkImportRequest(BaseModel):
    rows: list[BulkImportRow] = Field(..., min_length=1)


class BulkImportError(BaseModel):
    row: int
    reason: str


class BulkImportResponse(BaseModel):
    imported:   int
    skipped:    int
    duplicates: int = 0
    errors:     list[BulkImportError]


class AIInsightRequest(BaseModel):
    target: str          = 'empty'  # 'all', 'empty', 'selected'
    confidence: str | None = None   # None = use workspace ai_confidence setting
    notes: str | None    = None
    risk_ids: list[str]  = []
    overwrite: bool      = False

    @field_validator('target')
    @classmethod
    def validate_target(cls, v: str) -> str:
        if v not in {'all', 'empty', 'selected'}:
            raise ValueError("target must be 'all', 'empty', or 'selected'")
        return v

    @field_validator('confidence')
    @classmethod
    def validate_confidence(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if v not in {'conservative', 'balanced', 'assertive'}:
            raise ValueError("confidence must be 'conservative', 'balanced', or 'assertive'")
        return v


class AIInsightResponse(BaseModel):
    updated: int
    skipped: int
    failed: int
    updated_ids: list[str]
    failed_ids:  list[str]


class ConcentrationItem(BaseModel):
    name:  str
    count: int

class TopOwner(BaseModel):
    name:  str
    score: float

class ExposureIndex(BaseModel):
    pct:   int
    label: str
    total: int

class RiskVolume(BaseModel):
    total:        int
    high_critical: int

class ControlSignal(BaseModel):
    eff_pct:      int
    avg_residual: float
    signal_msg:   str
    signal_class: str   # 'good' | 'warn' | 'bad'

class RiskStatsResponse(BaseModel):
    exposure_index:  ExposureIndex
    risk_volume:     RiskVolume
    concentration:   list[ConcentrationItem]
    top_owner:       TopOwner | None
    control_signal:  ControlSignal