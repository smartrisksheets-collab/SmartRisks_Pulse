// src/types/risk.ts

export type RiskLevel = string; // display label set by workspace matrix config
export type RiskTreatment  = 'Mitigate' | 'Transfer' | 'Accept' | 'Avoid';
export type RiskMovement   = 'Increasing' | 'Improving' | 'Stable';
export type RiskFreshness  = 'Fresh' | 'Aging' | 'Stale';
export type MitigationStatus = 'Open' | 'In Progress' | 'Closed' | 'Accepted';

export interface RiskQuota {
  current: number;
  limit:   number;
  pct:     number;
  warn:    boolean;
  full:    boolean;
}

export interface Risk {
  id:                   string;
  tenant_id:            string;
  category:             string | null;
  description:          string | null;
  primary_impact:       string | null;
  owner:                string | null;
  owner_email:          string | null;
  logged_at:            string | null;
  likelihood:           number | null;
  impact_score:         number | null;
  severity:             number | null;
  level:                string | null;
  level_index:          number | null;
  is_elevated:          boolean;
  treatment:            RiskTreatment | null;
  controls:             string | null;
  control_effectiveness: number | null;
  residual:             number | null;
  overall_rating:       number | null;
  mitigation_plan:      string | null;
  comments:             string | null;
  ai_insight:           string | null;
  score_delta:          number;
  movement:             RiskMovement | null;
  freshness:            RiskFreshness | null;
  target_date:          string | null;
  mitigation_status:    MitigationStatus | null;
  last_reviewed_at:     string | null;
  control_last_tested:  string | null;
  control_test_result:  string | null;
  source:               string;
  created_at:           string;
  updated_at:           string;
}

export interface RiskCreate {
  category:              string;
  description:           string;
  owner:                 string;
  treatment:             RiskTreatment;
  likelihood:            number;
  impact_score:          number;
  primary_impact?:       string;
  controls?:             string;
  control_effectiveness?: number;
  mitigation_plan?:      string;
  comments?:             string;
  owner_email?:          string;
  target_date?:          string;
  mitigation_status?:    MitigationStatus;
  logged_at?:            string;
  control_last_tested?:  string;
  control_test_result?:  string;
}

export type RiskUpdate = Partial<RiskCreate>;

export interface RiskListMeta {
  total:     number;
  page:      number;
  page_size: number;
  quota:     RiskQuota;
}

export interface BulkImportRow {
  category:              string;
  description:           string;
  owner:                 string;
  treatment:             RiskTreatment;
  likelihood:            number;
  impact_score:          number;
  primary_impact?:       string;
  controls?:             string;
  control_effectiveness?: number;
  mitigation_plan?:      string;
  comments?:             string;
  logged_at?:            string;
}

export interface BulkImportError {
  row:    number;
  reason: string;
}

export interface BulkImportResult {
  imported:    number;
  skipped:     number;
  duplicates?: number;
  errors:      BulkImportError[];
}

export interface AIInsightRequest {
  target:     'all' | 'empty' | 'selected';
  notes?:     string;
  risk_ids?:  string[];
  overwrite?: boolean;
}

export interface AIInsightResult {
  updated:     number;
  skipped:     number;
  failed:      number;
  updated_ids: string[];
  failed_ids:  string[];
}

export interface RecycleBinItem {
  bin_id:     string;
  item_type:  string;
  item_id:    string;
  summary:    string;
  deleted_by: string;
  deleted_at: string;
  days_left:  number;
}

export interface ConcentrationItem { name: string; count: number; }
export interface TopOwner          { name: string; score: number; }

export interface RiskStats {
  exposure_index:  { pct: number; label: string; total: number; };
  risk_volume:     { total: number; high_critical: number; };
  concentration:   ConcentrationItem[];
  top_owner:       TopOwner | null;
  control_signal:  { eff_pct: number; avg_residual: number; signal_msg: string; signal_class: string; };
}