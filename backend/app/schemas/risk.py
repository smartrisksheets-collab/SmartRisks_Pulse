# app/schemas/risk.py

from __future__ import annotations
from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel, Field, field_validator, computed_field


TITLE_MAX = 80


def display_title(title: str | None, description: str | None, risk_id: str) -> str:
    """One label for a risk everywhere: its title, else the description cut at a word, else its ID."""
    t = (title or '').strip()
    if t:
        return t
    d = ' '.join((description or '').split())
    if not d:
        return risk_id
    if len(d) <= TITLE_MAX:
        return d
    cut = d[:TITLE_MAX - 1]
    space = cut.rfind(' ')
    if space >= TITLE_MAX // 2:
        cut = cut[:space]
    return cut.rstrip(' ,.;:') + '…'


class RiskCreate(BaseModel):
    title: str | None                    = Field(default=None, max_length=TITLE_MAX)
    category: str
    description: str
    owner: str
    treatment: str
    likelihood: int          = Field(..., ge=1, le=5)
    impact_score: int        = Field(..., ge=1, le=5)
    primary_impact: str | None           = None
    controls: str | None                 = None
    control_effectiveness: int | None    = Field(default=None, ge=0, le=5)
    mitigation_plan: str | None          = None
    comments: str | None                 = None
    ai_insight: str | None               = None
    owner_email: str | None              = None
    target_date: date | None             = None
    mitigation_status: str | None        = 'Open'
    logged_at: date | None               = None
    control_last_tested: date | None     = None
    control_test_result:      str | None = None
    control_assertion_source: str | None = None
    root_cause:               str | None = None
    financial_exposure:       str | None = None
    linked_decision:          str | None = None
    source:                   str | None = None

    @field_validator('category', 'description', 'owner', 'treatment', mode='before')
    @classmethod
    def strip_and_require(cls, v: str) -> str:
        v = str(v).strip()
        if not v:
            raise ValueError('Field cannot be empty')
        return v

    @field_validator('title', mode='before')
    @classmethod
    def blank_title_is_none(cls, v: object) -> str | None:
        if v is None:
            return None
        s = str(v).strip()
        return s or None

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
    title: str | None                    = Field(default=None, max_length=TITLE_MAX)
    category: str | None                 = None
    description: str | None              = None
    owner: str | None                    = None
    treatment: str | None                = None
    likelihood: int | None               = Field(default=None, ge=1, le=5)
    impact_score: int | None             = Field(default=None, ge=1, le=5)
    primary_impact: str | None           = None
    controls: str | None                 = None
    control_effectiveness: int | None    = Field(default=None, ge=0, le=5)
    mitigation_plan: str | None          = None
    comments: str | None                 = None
    ai_insight: str | None               = None
    owner_email: str | None              = None
    target_date: date | None             = None
    mitigation_status: str | None        = None
    logged_at: date | None               = None
    control_last_tested: date | None     = None
    control_test_result:      str | None = None
    control_assertion_source: str | None = None
    root_cause:               str | None = None
    financial_exposure:       str | None = None
    linked_decision:          str | None = None

    @field_validator('title', mode='before')
    @classmethod
    def blank_title_is_none(cls, v: object) -> str | None:
        if v is None:
            return None
        s = str(v).strip()
        return s or None

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
    title: str | None = None
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
    control_last_tested:      date | None
    control_test_result:      str | None
    control_assertion_source: str | None
    root_cause:               str | None
    financial_exposure:       str | None
    linked_decision:          str | None
    source:                   str = 'internal'
    created_at:               datetime
    updated_at:               datetime
    appetite_status:          str | None = None
    is_undecided:             bool = False
    is_past_target:           bool = False

    model_config = {'from_attributes': True}

    @computed_field
    @property
    def display_title(self) -> str:
        """The title, or the start of the description for risks logged before titles existed."""
        return display_title(self.title, self.description, self.id)

    @computed_field
    @property
    def control_freshness(self) -> str:
        if self.control_last_tested is None:
            return 'Unevidenced'
        days = (date.today() - self.control_last_tested).days
        if days < 15:
            return 'Fresh'
        if days < 30:
            return 'Aging'
        return 'Stale'


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
    title: str | None = None  # length checked per row by RiskCreate, so one long title fails only its row
    category: str
    description: str
    owner: str
    treatment: str
    likelihood: int       = Field(..., ge=1, le=5)
    impact_score: int     = Field(..., ge=1, le=5)
    primary_impact: str | None        = None
    controls: str | None              = None
    control_effectiveness: int | str | None = None  # resolved by resolve_ce_input in bulk_import
    mitigation_plan: str | None       = None
    comments: str | None              = None
    logged_at: date | None            = None
    owner_email: str | None                = None
    target_date: date | None               = None
    mitigation_status: str | None          = None
    control_last_tested: date | None       = None
    control_test_result: str | None        = None
    control_assertion_source: str | None   = None
    root_cause: str | None                 = None
    financial_exposure: str | None         = None
    linked_decision: str | None            = None

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
    residual_max: int
    signal_msg:   str
    signal_class: str   # 'good' | 'warn' | 'bad'

class RiskStatsResponse(BaseModel):
    exposure_index:  ExposureIndex
    risk_volume:     RiskVolume
    concentration:   list[ConcentrationItem]
    top_owner:       TopOwner | None
    control_signal:  ControlSignal

# ── Register views, score preview and risk context (UI step 5) ────────────────

class RiskViewCounts(BaseModel):
    all:            int
    exceeds:        int
    elevated:       int
    undecided:      int
    past_target:    int
    elevated_label: str          # e.g. "High or Critical", from the workspace bands
    avg_residual:   float | None # average residual of the risks counted in `all`
    residual_max:   int          # highest score on the workspace matrix


class ScorePreviewRequest(BaseModel):
    likelihood:            int        = Field(..., ge=1, le=5)
    impact_score:          int        = Field(..., ge=1, le=5)
    control_effectiveness: int | None = Field(default=None, ge=0, le=5)
    category:              str | None = None


class ScoreBreakdown(BaseModel):
    severity:        float
    level:           str
    level_index:     int
    is_elevated:     bool
    residual:        float
    residual_max:    int
    ce_level:        int | None
    ce_scale:        int
    ce_label:        str
    ce_pct:          int          # share of the inherent score the controls remove, 0 to 100
    threshold:       float | None
    appetite_status: str | None   # within, near, exceeds; None when no threshold or category
    note:            str


class RiskHistoryItem(BaseModel):
    at:      datetime | None
    user:    str | None
    action:  str | None
    summary: str | None


class RiskLinkedIncident(BaseModel):
    id:          str
    title:       str | None
    severity:    str | None
    status:      str | None
    reported_at: date | None


class RiskContext(BaseModel):
    score:     ScoreBreakdown
    history:   list[RiskHistoryItem]
    incidents: list[RiskLinkedIncident]
