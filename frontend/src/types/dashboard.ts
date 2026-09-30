export interface SnapshotDelta {
  has_data: boolean;
  period_label: string;
  avg_residual: number | null;
  high_risk_count: number | null;
  total_risks: number | null;
  control_eff: number | null;
  open_incidents: number | null;
  avg_mttr: number | null;
  financial_impact: number | null;
  /** Dedicated field: -(avg_residual delta). Rising health = falling residual. */
  health_delta: number | null;
}

export interface KPISummary {
  total_risks: number;
  high_risks: number;
  open_incidents: number;
  risk_severity_avg: number;
  control_effectiveness_avg: number;
  est_financial_exposure: number;
  appetite_configured: boolean;
  risks_within_appetite: number;
  risks_near_appetite: number;
  risks_exceeds_appetite: number;
}

export interface IncidentHealthSummary {
  label: string;
  sla_pct: number;
  critical_trend: string;
  health_score: number;
}

export interface IncidentLifecycle {
  new_count: number;
  under_review: number;
  resolved: number;
}

export interface IncidentResolution {
  days: number | null;
  data_points: number;
}

export interface TotalIncidentsSummary {
  count: number;
  critical_exposure: number;
  open_count: number;
  financial_total: number;
}

export interface TrendPoint {
  label: string;
  avg: number;
}

export interface VelocityPoint {
  key: string;
  label: string;
  created: number;
  resolved: number;
}

export interface IncidentFeedEntry {
  id: string;
  incident_id: string;
  incident_title: string | null;
  event_type: string;
  severity: string | null;
  category: string | null;
  status: string | null;
  old_status: string | null;
  linked_risk_id: string | null;
  created_at: string;
}

export interface ActivityEntry {
  id: string;
  risk_id: string | null;
  risk_title: string | null;
  action_type: string | null;
  old_value: number | null;
  new_value: number | null;
  user_email: string | null;
  category: string | null;
  level: string | null;
  label: string | null;
  created_at: string;
}

export interface TopRisk {
  id: string;
  description: string | null;
  residual: number | null;
  level: string | null;
  category: string | null;
}

export interface TopIncident {
  id: string;
  title: string | null;
  severity: string | null;
  category: string | null;
  reported_at: string | null;
  status: string | null;
}

export interface IncidentCategoryBreakdown {
  category: string;
  count: number;
  financial_total: number;
}

export type HealthStatus    = 'Healthy' | 'Monitoring' | 'At Risk' | 'Critical' | 'No data';
export type ConfidenceLevel = 'High' | 'Medium' | 'Low';
export type PressureLevel   = 'Elevated' | 'Moderate' | 'Low' | 'No data';
export type EvidenceStatus  = 'contradicted' | 'evidenced' | 'unevidenced';

export interface ScoreComponent {
  name: string;
  weight: number;
  score: number;
  suppressed: boolean;
}

export interface RecommendedAction {
  key: string;
  title: string;
  detail: string;
  done_when: string;
  owner: string | null;
  due: string | null;
  refs: string[];
}

export interface AppetiteComparison {
  configured: boolean;
  scored_risks: number;
  avg_residual_scored: number | null;
  threshold_avg: number | null;
}

export interface EnterpriseHealth {
  score: number;
  status: HealthStatus;
  raw_status: HealthStatus;
  capped_by_appetite: boolean;
  confidence: ConfidenceLevel;
  confidence_reasons: string[];
  components: ScoreComponent[];
  appetite: AppetiteComparison;
  avg_residual: number;
  scale_max: number;
  incident_health_score: number | null;
  incident_count: number;
  financial_exposure: number;
  financial_quantified: number;
}

export interface PressureCategoryRow {
  category: string;
  covered: boolean;
  risks: number;
  elevated: number;
  incidents: number;
  within: number;
  near: number;
  exceeds: number;
  threshold_configured: boolean;
}

export interface RiskPressure {
  score: number;
  level: PressureLevel;
  components: ScoreComponent[];
  active_risks: number;
  elevated: number;
  exceeds_appetite: number;
  open_incidents: number;
  open_incidents_overdue: number;
  undecided: number;
  past_target: number;
  evidenced: number;
  rated: number;
  by_category: PressureCategoryRow[];
  actions: RecommendedAction[];
}

export interface MaterialisedRisk {
  risk_id: string;
  category: string | null;
  description: string | null;
  owner: string | null;
  residual: number | null;
  control_rating: number | null;
  contradicted: boolean;
  incident_count: number;
  latest_incident_id: string | null;
  latest_incident_severity: string | null;
  latest_incident_reported_at: string | null;
  financial_total: number;
  financial_quantified: number;
}

export interface UnlinkedIncident {
  incident_id: string;
  title: string | null;
  category: string | null;
  severity: string | null;
  reported_at: string | null;
  covered: boolean;
  covering_categories: string[];
  candidate_risks: number;
}

export interface Correlation {
  risks_total: number;
  risks_materialised: number;
  contradicted: number;
  incidents_total: number;
  incidents_unlinked: number;
  uncovered_categories: string[];
  materialised_incidents: number;
  materialised_financial_total: number;
  materialised_financial_quantified: number;
  repeat_categories: string[];
  recurring_unlinked_categories: string[];
  highest_unlinked_severity: string | null;
  highest_unlinked_id: string | null;
  materialised: MaterialisedRisk[];
  unlinked: UnlinkedIncident[];
  materialised_actions: RecommendedAction[];
  unlinked_actions: RecommendedAction[];
}

export interface ControlEvidenceRow {
  risk_id: string;
  category: string | null;
  description: string | null;
  owner: string | null;
  control_rating: number | null;
  last_tested: string | null;
  assertion_source: string | null;
  status: EvidenceStatus;
}

export interface ControlEvidence {
  rated: number;
  with_recent_test: number;
  independently_asserted: number;
  evidenced: number;
  rated_high: number;
  contradicted: number;
  rows: ControlEvidenceRow[];
  actions: RecommendedAction[];
}

export interface MovementPoint {
  month_key: string;
  label: string;
  avg_residual: number | null;
  incidents_created: number;
  is_live: boolean;
}

export interface Movement {
  snapshots_held: number;
  points: MovementPoint[];
  trend_findings: string[];
  overlap_findings: string[];
}

export interface DashboardData {
  kpis: KPISummary;
  risks_by_level: Record<string, number>;
  risks_by_category: Record<string, number>;
  top_risks: TopRisk[];
  top_open_incidents: TopIncident[];
  incidents_by_category: IncidentCategoryBreakdown[];
  residual_trend: TrendPoint[];
  incident_velocity: VelocityPoint[];
  incident_health: IncidentHealthSummary;
  total_incidents: TotalIncidentsSummary;
  lifecycle: IncidentLifecycle;
  avg_resolution: IncidentResolution;
  activity_feed: ActivityEntry[];
  incident_feed: IncidentFeedEntry[];
  attention: string[];
  snapshot_delta: SnapshotDelta;
  enterprise_health: EnterpriseHealth;
  pressure: RiskPressure;
  correlation: Correlation;
  control_evidence: ControlEvidence;
  movement: Movement;
  unified_brief: UnifiedBrief | null;
}

export interface UnifiedBrief {
  paragraphs: string[];
  generated_at: string;
  generated_by: string | null;
  stale: boolean;
}

export interface ActionItem {
  sentence_num: number;
  source_label: string;
  title: string;
  done_when: string;
}

export interface ExecInsight {
  summary: string;
  action_items: ActionItem[];
  word_count: number;
  owners: string[];
}