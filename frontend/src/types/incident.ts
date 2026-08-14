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
  linked_risk_id: string | null;
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
  linked_risk_id?: string;
  immediate_actions?: string;
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

export interface IncidentHealth {
  pct: number;
  label: string;
  sla_pct: number;
  critical_trend: string;
}

export interface IncidentTotals {
  count: number;
  critical_count: number;
  open_count: number;
}

export interface IncidentLifecycle {
  new: number;
  under_review: number;
  resolved: number;
}

export interface IncidentResolution {
  avg_days: number | null;
  total_financial_impact: string;
}

export interface IncidentStats {
  health: IncidentHealth;
  totals: IncidentTotals;
  lifecycle: IncidentLifecycle;
  resolution: IncidentResolution;
}