from pydantic import BaseModel, Field


class SnapshotDelta(BaseModel):
    has_data: bool = False
    period_label: str = ""
    avg_residual: float | None = None
    high_risk_count: float | None = None
    total_risks: float | None = None
    control_eff: float | None = None
    open_incidents: float | None = None
    avg_mttr: float | None = None
    financial_impact: float | None = None
    # Dedicated field per SMARTRISK_V2_DECISIONS: -(avg_residual delta)
    # Rising health = falling residual. Never compute this on frontend.
    health_delta: float | None = None


class KPISummary(BaseModel):
    total_risks: int = 0
    high_risks: int = 0
    open_incidents: int = 0
    risk_severity_avg: float = 0.0
    control_effectiveness_avg: float = 0.0
    est_financial_exposure: float = 0.0
    appetite_configured: bool = False
    risks_within_appetite: int = 0
    risks_near_appetite: int = 0
    risks_exceeds_appetite: int = 0


class IncidentHealthSummary(BaseModel):
    label: str = ""
    sla_pct: float = 0.0
    critical_trend: str = ""
    health_score: int = 0


class IncidentLifecycle(BaseModel):
    new_count: int = 0
    under_review: int = 0
    resolved: int = 0


class IncidentResolution(BaseModel):
    days: float | None = None
    data_points: int = 0


class TotalIncidentsSummary(BaseModel):
    count: int = 0
    critical_exposure: int = 0
    open_count: int = 0
    financial_total: float = 0.0


class TrendPoint(BaseModel):
    label: str
    avg: float


class VelocityPoint(BaseModel):
    key: str
    label: str
    created: int
    resolved: int


class ActivityEntry(BaseModel):
    id: str
    risk_id: str | None = None
    risk_title: str | None = None
    action_type: str | None = None
    old_value: float | None = None
    new_value: float | None = None
    user_email: str | None = None
    category: str | None = None
    level: str | None = None
    label: str | None = None
    created_at: str


class TopRisk(BaseModel):
    id: str
    description: str | None = None
    residual: float | None = None
    level: str | None = None
    category: str | None = None


class TopIncident(BaseModel):
    id: str
    title: str | None = None
    severity: str | None = None
    category: str | None = None
    reported_at: str | None = None
    status: str | None = None


class IncidentCategoryBreakdown(BaseModel):
    category: str
    count: int = 0
    financial_total: float = 0.0


class IncidentFeedEntry(BaseModel):
    id: str
    incident_id: str
    incident_title: str | None = None
    event_type: str
    severity: str | None = None
    category: str | None = None
    status: str | None = None
    old_status: str | None = None
    linked_risk_id: str | None = None
    created_at: str


class ScoreComponent(BaseModel):
    name: str = ""
    weight: int = 0
    score: int = 0
    suppressed: bool = False


class RecommendedAction(BaseModel):
    key: str = ""
    title: str = ""
    detail: str = ""
    done_when: str = ""
    owner: str | None = None
    due: str | None = None
    refs: list[str] = Field(default_factory=list)


class AppetiteComparison(BaseModel):
    configured: bool = False
    scored_risks: int = 0
    avg_residual_scored: float | None = None
    threshold_avg: float | None = None


class EnterpriseHealth(BaseModel):
    score: int = 0
    status: str = ""
    raw_status: str = ""
    capped_by_appetite: bool = False
    confidence: str = ""
    confidence_reasons: list[str] = Field(default_factory=list)
    components: list[ScoreComponent] = Field(default_factory=list)
    appetite: AppetiteComparison = Field(default_factory=AppetiteComparison)
    avg_residual: float = 0.0
    scale_max: int = 25
    incident_health_score: int | None = None
    incident_count: int = 0
    financial_exposure: float = 0.0
    financial_quantified: int = 0


class PressureCategoryRow(BaseModel):
    category: str = ""
    covered: bool = True
    risks: int = 0
    elevated: int = 0
    incidents: int = 0
    within: int = 0
    near: int = 0
    exceeds: int = 0
    threshold_configured: bool = False


class RiskPressure(BaseModel):
    score: int = 0
    level: str = ""
    components: list[ScoreComponent] = Field(default_factory=list)
    active_risks: int = 0
    elevated: int = 0
    exceeds_appetite: int = 0
    open_incidents: int = 0
    open_incidents_overdue: int = 0
    undecided: int = 0
    past_target: int = 0
    evidenced: int = 0
    rated: int = 0
    by_category: list[PressureCategoryRow] = Field(default_factory=list)
    actions: list[RecommendedAction] = Field(default_factory=list)


class MaterialisedRisk(BaseModel):
    risk_id: str = ""
    category: str | None = None
    description: str | None = None
    owner: str | None = None
    residual: float | None = None
    control_rating: int | None = None
    contradicted: bool = False
    incident_count: int = 0
    latest_incident_id: str | None = None
    latest_incident_severity: str | None = None
    latest_incident_reported_at: str | None = None
    financial_total: float = 0.0
    financial_quantified: int = 0


class UnlinkedIncident(BaseModel):
    incident_id: str = ""
    title: str | None = None
    category: str | None = None
    severity: str | None = None
    reported_at: str | None = None
    covered: bool = False
    covering_categories: list[str] = Field(default_factory=list)
    candidate_risks: int = 0


class Correlation(BaseModel):
    risks_total: int = 0
    risks_materialised: int = 0
    contradicted: int = 0
    incidents_total: int = 0
    incidents_unlinked: int = 0
    uncovered_categories: list[str] = Field(default_factory=list)
    materialised_incidents: int = 0
    materialised_financial_total: float = 0.0
    materialised_financial_quantified: int = 0
    repeat_categories: list[str] = Field(default_factory=list)
    recurring_unlinked_categories: list[str] = Field(default_factory=list)
    highest_unlinked_severity: str | None = None
    highest_unlinked_id: str | None = None
    materialised: list[MaterialisedRisk] = Field(default_factory=list)
    unlinked: list[UnlinkedIncident] = Field(default_factory=list)
    materialised_actions: list[RecommendedAction] = Field(default_factory=list)
    unlinked_actions: list[RecommendedAction] = Field(default_factory=list)


class ControlEvidenceRow(BaseModel):
    risk_id: str = ""
    category: str | None = None
    description: str | None = None
    owner: str | None = None
    control_rating: int | None = None
    last_tested: str | None = None
    assertion_source: str | None = None
    status: str = ""


class ControlEvidence(BaseModel):
    rated: int = 0
    with_recent_test: int = 0
    independently_asserted: int = 0
    evidenced: int = 0
    rated_high: int = 0
    contradicted: int = 0
    rows: list[ControlEvidenceRow] = Field(default_factory=list)
    actions: list[RecommendedAction] = Field(default_factory=list)


class MovementPoint(BaseModel):
    month_key: str = ""
    label: str = ""
    avg_residual: float | None = None
    incidents_created: int = 0
    is_live: bool = False


class Movement(BaseModel):
    snapshots_held: int = 0
    points: list[MovementPoint] = Field(default_factory=list)
    trend_findings: list[str] = Field(default_factory=list)
    overlap_findings: list[str] = Field(default_factory=list)

class UnifiedBriefResponse(BaseModel):
    paragraphs: list[str] = Field(default_factory=list)
    generated_at: str = ""
    generated_by: str | None = None
    stale: bool = False


class DashboardResponse(BaseModel):
    kpis: KPISummary
    risks_by_level: dict[str, int]
    risks_by_category: dict[str, int]
    top_risks: list[TopRisk]
    residual_trend: list[TrendPoint]
    incident_velocity: list[VelocityPoint]
    incident_health: IncidentHealthSummary
    total_incidents: TotalIncidentsSummary
    lifecycle: IncidentLifecycle
    avg_resolution: IncidentResolution
    activity_feed: list[ActivityEntry]
    incident_feed: list[IncidentFeedEntry]
    top_open_incidents: list[TopIncident]
    incidents_by_category: list[IncidentCategoryBreakdown]
    attention: list[str]
    snapshot_delta: SnapshotDelta
    enterprise_health: EnterpriseHealth = Field(default_factory=EnterpriseHealth)
    pressure: RiskPressure = Field(default_factory=RiskPressure)
    correlation: Correlation = Field(default_factory=Correlation)
    control_evidence: ControlEvidence = Field(default_factory=ControlEvidence)
    movement: Movement = Field(default_factory=Movement)
    unified_brief: UnifiedBriefResponse | None = None


class ActionItem(BaseModel):
    sentence_num: int
    source_label: str
    title: str
    done_when: str


class ExecInsightResponse(BaseModel):
    summary: str
    action_items: list[ActionItem]
    word_count: int
    owners: list[str]