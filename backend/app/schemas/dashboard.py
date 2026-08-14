from pydantic import BaseModel


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
    top_open_incidents: list[TopIncident]
    attention: list[str]
    snapshot_delta: SnapshotDelta