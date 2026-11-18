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

/** Fields the log form sends. Optional fields send null to clear them on edit. */
export interface IncidentCreate {
  description: string;
  category: string;
  severity: string;
  reported_by: string;
  reported_at: string;
  title?: string | null;
  priority?: string | null;
  status?: IncidentStage;
  root_cause?: string | null;
  assigned_to?: string | null;
  reporter_email?: string | null;
  channel?: string | null;
  incident_type?: string | null;
  incident_dt?: string | null;
  location?: string | null;
  impact_summary?: string | null;
  affected_asset?: string | null;
  business_unit?: string | null;
  linked_risk_id?:    string | null;
  linked_control?:    string | null;
  control_outcome?:   string | null;
  impact_confidence?: string | null;
  immediate_actions?: string | null;
  evidence_link?: string | null;
  analyst_notes?: string | null;
  containment_date?: string | null;
  tags?: string | null;
  resolution_summary?: string | null;
  financial_impact?: string | null;
  resolved_at?: string | null;
}

export type IncidentUpdate = Partial<IncidentCreate>;

export const INCIDENT_STAGES = ['New', 'Triaged', 'Investigating', 'Remediating', 'Resolved', 'Closed'] as const;
export type IncidentStage = typeof INCIDENT_STAGES[number];

export const INCIDENT_TITLE_MAX = 80;

/** An incident with the labels the log and panel show. All computed by the backend. */
export interface IncidentRow extends Incident {
  display_title: string;
  is_open: boolean;
  is_high: boolean;
  target_state: 'due' | 'due_today' | 'missed' | 'met' | 'none';
  target_text: string;
  resolve_by: string | null;
  target_days: number;
  link_state: 'linked' | 'unlinked' | 'uncovered';
  linked_risk_title: string | null;
}

export interface IncidentViewCounts {
  open: number;
  unlinked: number;
  high: number;
  resolved: number;
  all: number;
  high_label: string;
  summary: string;
  owners: string[];
}

export interface IncidentRiskRef {
  id: string;
  title: string;
  residual: number | null;
  on_register: boolean;
}

export interface IncidentContext {
  incident: IncidentRow;
  steps: { name: string; state: 'done' | 'current' | 'todo' }[];
  stage_note: string;
  next_status: IncidentStage | null;
  next_label: string | null;
  linked_risk: IncidentRiskRef | null;
  covered: boolean;
  link_note: string;
  suggested_risks: IncidentRiskRef[];
  history: { at: string; user: string | null; action: string | null; summary: string | null }[];
}

export interface TargetPreviewRequest {
  severity: string;
  reported_at?: string | null;
  category?: string | null;
  linked_risk_id?: string | null;
}

export interface TargetPreview {
  severity: string;
  target_hours: number;
  target_days: number;
  resolve_by: string | null;
  due_note: string;
  covered: boolean;
  suggested_risks: IncidentRiskRef[];
  outcomes: string[];
}

export interface IncidentListMeta {
  total: number;
  page: number;
  page_size: number;
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
  triaged: number;
  investigating: number;
  remediating: number;
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

export interface SeverityPerformance {
  severity: string;
  target_days: number;
  open: number;
  resolved: number;
  met: number;
  median_days: number | null;
}

export interface IncidentCost {
  id: string;
  title: string | null;
  amount: string;
  confidence: string | null;
}

export interface CategoryDriver {
  category: string;
  count: number;
  open: number;
  unlinked_ids: string[];
}

export interface IncidentStats {
  health: IncidentHealth;
  totals: IncidentTotals;
  lifecycle: IncidentLifecycle;
  resolution: IncidentResolution;
  monthly_trend: MonthlyTrend[];
  top_drivers: TopDriver[];
  by_severity: SeverityPerformance[];
  costs: IncidentCost[];
  by_category: CategoryDriver[];
}