// src/types/incident_severity.ts

export interface SeverityLevelResponse {
  id: string;
  tenant_id: string;
  label: string;
  sort_order: number;
  color: string;
  criteria_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface SlaTargetResponse {
  id: string;
  severity_id: string;
  target_value: number;
  target_unit: 'hours' | 'days';
  target_hours: number;
  notify_on_log: string | null;
  created_at: string;
  updated_at: string;
}

export interface EscalationRuleResponse {
  id: string;
  tenant_id: string;
  auto_escalate_on_breach: boolean;
  escalate_to: string;
  flag_unowned_after_hours: number | null;
  created_at: string;
  updated_at: string;
}

export interface BandMapResponse {
  id: string;
  severity_id: string;
  risk_band_label: string;
  created_at: string;
}

export interface IncidentSeverityConfig {
  levels: SeverityLevelResponse[];
  sla_targets: SlaTargetResponse[];
  escalation_rules: EscalationRuleResponse | null;
  band_map: BandMapResponse[];
}

export interface BreachPreviewItem {
  incident_id: string;
  severity: string;
  age_hours: number;
  target_hours: number | null;
  is_breach: boolean;
}

export interface BreachPreviewResponse {
  items: BreachPreviewItem[];
  breach_count: number;
  breach_rate_pct: number;
  unowned_count: number;
}

export interface SeverityLevelUpsert {
  id?: string;
  label: string;
  sort_order: number;
  color: string;
  criteria_text?: string;
}

export interface SlaTargetUpsert {
  severity_id: string;
  target_value: number;
  target_unit: 'hours' | 'days';
  notify_on_log: string | null;
}

export interface EscalationRuleUpsert {
  auto_escalate_on_breach: boolean;
  escalate_to: string;
  flag_unowned_after_hours: number | null;
}