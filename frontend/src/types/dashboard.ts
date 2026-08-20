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

export interface DashboardData {
  kpis: KPISummary;
  risks_by_level: Record<string, number>;
  risks_by_category: Record<string, number>;
  top_risks: TopRisk[];
  top_open_incidents: TopIncident[];
  residual_trend: TrendPoint[];
  incident_velocity: VelocityPoint[];
  incident_health: IncidentHealthSummary;
  total_incidents: TotalIncidentsSummary;
  lifecycle: IncidentLifecycle;
  avg_resolution: IncidentResolution;
  activity_feed: ActivityEntry[];
  attention: string[];
    snapshot_delta: SnapshotDelta;
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
}