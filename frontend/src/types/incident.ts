// src/types/incident.ts

export interface Incident {
  id: string;
  tenant_id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  severity: string | null;
  priority: string | null;
  status: string | null;
  root_cause: string | null;
  assigned_to: string | null;
  reported_by: string | null;
  reported_at: string | null;
  reporter_email: string | null;
  channel: string | null;
  incident_type: string | null;
  incident_dt: string | null;
  location: string | null;
  impact_summary: string | null;
  affected_asset: string | null;
  business_unit: string | null;
  linked_risk_id:    string | null;
  linked_control:    string | null;
  control_outcome:   string | null;
  impact_confidence: string | null;
  immediate_actions: string | null;
  evidence_link: string | null;
  analyst_notes: string | null;
  containment_date: string | null;
  tags: string | null;
  review_status: string | null;
  risk_impacted: string | null;
  resolution_summary: string | null;
  financial_impact: string | null;
  resolved_at: string | null;
  ai_impact: string | null;
  ai_actions: string | null;
  ai_status: string | null;
  ai_last_generated: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncidentCreate {
  description: string;
  category: string;
  severity: string;
  reported_by: string;
  reported_at: string;
  title?: string;
  priority?: string;
  status?: string;
  root_cause?: string;
  assigned_to?: string;
  reporter_email?: string;
  channel?: string;
  incident_type?: string;
  incident_dt?: string;
  location?: string;
  impact_summary?: string;
  affected_asset?: string;
  business_unit?: string;
  linked_risk_id?:    string | null;
  linked_control?:    string | null;
  control_outcome?:   string | null;
  impact_confidence?: string | null;
  immediate_actions?: string | null;
  evidence_link?: string;
  analyst_notes?: string;
  containment_date?: string;
  tags?: string;
  review_status?: string;
  risk_impacted?: string;
  resolution_summary?: string;
  financial_impact?: string;
  resolved_at?: string;
}

export type IncidentUpdate = Partial<IncidentCreate> & {
  status?: string;
  assigned_to?: string;
  review_status?: string;
  risk_impacted?: string;
  resolution_summary?: string;
};

export interface IncidentListMeta {
  total: number;
  page: number;
  page_size: number;
}

export interface IncidentListResponse {
  items: Incident[];
  meta: IncidentListMeta;
}

export interface HealthComponent {
  name: string;
  weight: number;
  score: number;
  suppressed: boolean;
}

export interface IncidentHealth {
  score: number;
  label: string;
  within_sla: number;
  within_sla_total: number;
  open_past_target: number;
  linked: number;
  total: number;
  flag: string | null;
  components: HealthComponent[];
  small_n: boolean;
}

export interface IncidentTotals {
  count: number;
  open_count: number;
  overdue_count: number;
  high_or_above: number;
  open_over_150d: number;
  flag: string | null;
}

export interface MonthlyTrend {
  month: string;
  count: number;
}

export interface TopDriver {
  id: string;
  title: string | null;
  severity: string | null;
  age_days: number;
  category: string | null;
  status: string | null;
}

export interface IncidentInsightAction {
  badge: string;
  text: string;
}

export interface IncidentPageInsight {
  actions: IncidentInsightAction[];
}

export interface IncidentLifecycle {
  new: number;
  open: number;
  in_progress: number;
  under_review: number;
  resolved: number;
  closed: number;
  oldest_open_days: number | null;
}

export interface IncidentResolution {
  oldest_open_days: number | null;
  oldest_open_id: string | null;
  oldest_open_severity: string | null;
  oldest_open_date: string | null;
  median_days: number | null;
  resolved_count: number;
  breach_count: number;
  breach_total: number;
  impact_total: string;
  impact_count: number;
  impact_total_count: number;
  flag: string | null;
}

export interface IncidentStats {
  health: IncidentHealth;
  totals: IncidentTotals;
  lifecycle: IncidentLifecycle;
  resolution: IncidentResolution;
  monthly_trend: MonthlyTrend[];
  top_drivers: TopDriver[];
}