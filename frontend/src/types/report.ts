// src/types/report.ts

// ── Block keys ─────────────────────────────────────────────────────────────────

export type BlockKey =
  | 'exposure-index'
  | 'risk-snapshot'
  | 'key-risk-changes'
  | 'incident-stability'
  | 'ai-exec-summary'
  | 'executive-commentary'
  | 'exposure-trend'
  | 'residual-risk-trend'
  | 'risk-distribution'
  | 'incident-trend'
  | 'top-risks'
  | 'top-emerging-risks'
  | 'major-incidents'
  | 'findings'
  | 'recommendations'
  | 'conclusion'
  | 'risk-ownership'
  | 'incident-analytics'
  | 'executive-dashboard'
  | 'risk-heat-map'
  | 'methodology'
  | 'risk-incident-correlation'
  | 'appetite-breaches'
  | 'decisions-needed'
  | 'control-evidence';

// ── Block data shapes (mirrors Python service output) ─────────────────────────

export interface ExposureIndexData {
  score: number;
  label: string;
  health: number;
  health_label: string;
  health_color: string;
  narrative: string;
  no_data?: boolean;
}

export interface RiskSnapshotData {
  total: number;
  high_count: number;
  avg_residual: number;
  by_treatment: Record<string, number>;
  by_level: Record<string, number>;
  narrative: string;
}

export interface KeyRiskChangesData {
  increased: number;
  decreased: number;
  new_high_risks: number;
  narrative?: string;
  note?: string;
}

export interface IncidentStabilityData {
  total: number;
  open: number;
  closed: number;
  mttr_days: number | null;
  by_severity: Record<string, number>;
  narrative: string;
}

export interface AIExecSummaryData {
  paragraphs: string[];
}

export interface ExecutiveCommentaryData {
  placeholder: boolean;
  text: string;
}

export interface TrendPoint {
  label: string;
  score?: number;
  avg?: number;
  count?: number;
}

export interface TrendData {
  points: TrendPoint[];
  narrative: string;
}

export interface RiskDistributionData {
  by_level: Record<string, number>;
  by_category: Record<string, number>;
  narrative: string;
}

export interface RiskRow {
  id: string;
  category: string;
  desc: string;
  owner: string;
  level: string;
  residual: number;
  treatment: string;
  movement: string;
  score_delta: number;
}

export interface TopRisksData {
  risks: RiskRow[];
  intro: string;
}

export interface IncidentRow {
  id: string;
  date_reported: string | null;
  category: string;
  severity: string;
  status: string;
  desc: string;
}

export interface MajorIncidentsData {
  incidents: IncidentRow[];
  intro: string;
}

export interface FindingsData {
  positive_signals:    string[];
  key_risks:           string[];
  areas_for_attention: string[];
  assurance_gaps?:     string[];
  governance_gaps?:    string[];
  findings:            string[];
  narrative:           string;
}

export interface Recommendation {
  title:                string;
  priority:             string;
  owner:                string;
  due:                  string;
  outcome?:             string;
  trigger?:             string;
  completion_criterion?: string;
  body:                 string;
}

export interface RecommendationsData {
  recommendations: Recommendation[];
  intro: string;
}

export interface ConclusionData {
  status: string;
  focus_text: string;
  text: string;
}

export interface OwnerRow {
  owner: string;
  high_count: number;
  total_count: number;
  avg_residual: number;
  top_category: string;
}

export interface RiskOwnershipData {
  top_owners: OwnerRow[];
  concentration: number;
  all_high_count: number;
  narrative: string;
}

export interface IncidentAnalyticsData {
  total: number;
  open: number;
  closed: number;
  mttr_days: number | null;
  by_category: Record<string, number>;
  by_severity: Record<string, number>;
  total_financial: number;
  critical_count: number;
  narrative: string;
}

export interface KPICard {
  label: string;
  value: number | string;
  unit: string;
  color: string;
  direction: 'up' | 'down' | 'stable' | null;
  prev: number | null;
}

export interface ExecutiveDashboardData {
  no_data?: boolean;
  kpis: KPICard[];
  posture: { status: string; trend: string; confidence: string };
  bullets: string[];
  prev_exposure: number | null;
  has_snapshot: boolean;
  heading_text?: string;
}

export interface HeatMapCell {
  likelihood: number;
  impact:     number;
  severity:   number;
  band_index: number;
  risks:      { id: string; short_id: string; category: string }[];
}

export interface RiskHeatMapData {
  grid:             HeatMapCell[][];
  likelihood_scale: number;
  impact_scale:     number;
  band_labels:      string[];
  total_placed:     number;
  unplaced:         number;
  active_risks:     number;
}

export interface MethodologyData {
  snapshot_count:          number;
  allow_trends:            boolean;
  allow_percentages:       boolean;
  incidents_enabled:       boolean;
  active_risks:            number;
  residual_matches_engine: boolean;
  supplied_is_subtractive: boolean;
  avg_residual:            number;
  avg_residual_pulse:      number;
  ce_scale?:               number;
  pulse_residuals:         { id: string; supplied: number; pulse: number; diff: number; status: string }[];
  controls_untested:       number;
  unasserted:              number;
}

export interface CorrelationMaterialisedRow {
  risk_id:                  string;
  category:                 string | null;
  owner:                    string | null;
  residual:                 number;
  control_rating:           number | null;
  contradicted:             boolean;
  incident_count:           number;
  latest_incident_id:       string;
  latest_incident_severity: string | null;
}

export interface CorrelationUnlinkedRow {
  incident_id: string;
  title:       string | null;
  category:    string;
  severity:    string | null;
  reported_at: string | null;
  covered:     boolean | null;   // null when the category mapping could not be read
}

export interface RiskIncidentCorrelationData {
  period:          { from: string | null; to: string };
  risks_total:     number;
  incidents_total: number;
  indicative:      boolean;
  no_data:         boolean;
  narrative:       string;
  materialised?:   { count: number; incident_count: number; ids: string[] };
  unlinked?:       { count: number; uncovered_categories: string[]; uncovered_incidents: number };
  controls?:       { materialised: number; contradicted: number; rated: number; evidenced: number };
  mapping_configured?: boolean;
  materialised_rows?:  CorrelationMaterialisedRow[];
  unlinked_rows?:      CorrelationUnlinkedRow[];
  rows_truncated?:     boolean;
}

// ── Pulse UI sections (UI step 7). Residual and appetite values are whole numbers. ──

export interface AppetiteBreachRow {
  id:          string;
  title:       string;
  category:    string;
  owner:       string | null;
  level:       string;
  level_index: number;
  residual:    number;
  threshold:   number;
  over_by:     number;
}

export interface AppetiteBreachesData {
  thresholds_configured: boolean;
  count:          number;
  near_count:     number;
  risks_total:    number;
  risks:          AppetiteBreachRow[];
  rows_truncated: boolean;
  narrative:      string;
}

export interface DecisionRow {
  id:          string;
  title:       string;
  owner:       string | null;
  level:       string;
  level_index: number;
  residual:    number;
  reason:      string;
}

export interface DecisionsNeededData {
  count:          number;
  risks_total:    number;
  risks:          DecisionRow[];
  rows_truncated: boolean;
  narrative:      string;
}

export interface ControlGapRow {
  id:           string;
  title:        string;
  owner:        string | null;
  rating:       string;
  rating_level: number | null;
  residual:     number;
  contradicted: boolean;
  reasons:      string[];
}

export interface ControlEvidenceData {
  rated:          number;
  unrated:        number;
  evidenced:      number;
  contradicted:   number;
  ce_scale:       number;
  gaps:           ControlGapRow[];
  rows_truncated: boolean;
  narrative:      string;
}

export interface SuppressedBlockData {
  status:      'suppressed';
  reason:      string;
  requirement: string;
}

export type BlockData =
  | ExposureIndexData
  | RiskSnapshotData
  | KeyRiskChangesData
  | IncidentStabilityData
  | AIExecSummaryData
  | ExecutiveCommentaryData
  | TrendData
  | RiskDistributionData
  | TopRisksData
  | MajorIncidentsData
  | FindingsData
  | RecommendationsData
  | ConclusionData
  | RiskOwnershipData
  | IncidentAnalyticsData
  | ExecutiveDashboardData
  | RiskHeatMapData
  | MethodologyData
  | RiskIncidentCorrelationData
  | AppetiteBreachesData
  | DecisionsNeededData
  | ControlEvidenceData
  | SuppressedBlockData;

export type BlockDataMap = Record<string, BlockData>;

// ── Report settings ────────────────────────────────────────────────────────────

export interface SignoffSettings {
  include: boolean;
  prepared_by: string;
  prepared_title: string;
  approved_by: string;
  approved_title: string;
}

export interface ReportSettings {
  report_title: string;
  cover_page: 'Yes' | 'No';
  footer_text: string;
  page_numbering: 'Show' | 'Hide';
  prepared_for: string;
  distribution: string;
  report_ref: string;
  version: string;
  signoff: SignoffSettings;
}

export const DEFAULT_SETTINGS: ReportSettings = {
  report_title:   '',
  cover_page:     'Yes',
  footer_text:    'Confidential',
  page_numbering: 'Show',
  prepared_for:   '',
  distribution:   '',
  report_ref:     '',
  version:        'v1.0',
  signoff: {
    include:        true,
    prepared_by:    '',
    prepared_title: '',
    approved_by:    '',
    approved_title: '',
  },
};

// ── Templates ──────────────────────────────────────────────────────────────────

export interface ReportTemplate {
  template_id: string;
  name: string;
  description: string;
  report_type: string;
  blocks: BlockKey[];
  settings: Partial<ReportSettings>;
  is_default: boolean;
  created_by: string;
  updated_at: string;
}

// ── Date range ─────────────────────────────────────────────────────────────────

export type PeriodPreset =
  | 'last_30'
  | 'quarter_to_date'
  | 'last_quarter'
  | 'last_6_months'
  | 'last_12_months'
  | 'custom';

export interface ReportPeriod {
  preset:    PeriodPreset;
  date_from: string | null;   // YYYY-MM-DD, used when preset is custom
  date_to:   string | null;
}

export interface DateRange {
  date_from: string | null;
  date_to:   string;
}

export type ExportFormat = 'pdf' | 'pptx';

// ── Draft (one per person per workspace, migration 065) ────────────────────────

export interface ReportDraft {
  blocks:      BlockKey[];
  settings:    ReportSettings;
  ai_data:     Record<string, string>;
  ai_reviewed: string[];
  period:      ReportPeriod;
  template:    string;
  updated_at?: string;
}

export type AIStatus = 'not_included' | 'not_written' | 'draft' | 'reviewed';

// ── BLOCK KEY → LABEL map ──────────────────────────────────────────────────────

export const BLOCK_LABELS: Record<BlockKey, string> = {
  'exposure-index':       'Risk Health',
  'risk-snapshot':        'Risk Snapshot',
  'key-risk-changes':     'Key Risk Changes',
  'incident-stability':   'Incident Stability',
  'ai-exec-summary':      'Executive Summary',
  'executive-commentary': 'Executive Commentary',
  'exposure-trend':       'Exposure Trend',
  'residual-risk-trend':  'Residual Risk Trend',
  'risk-distribution':    'Risk Distribution',
  'incident-trend':       'Incident Trend',
  'top-risks':            'Top Risks',
  'top-emerging-risks':   'Top Emerging Risks',
  'major-incidents':      'Major Incidents',
  'findings':             'Findings',
  'recommendations':      'Recommendations',
  'conclusion':           'Conclusion',
  'risk-ownership':       'Risk Ownership',
  'incident-analytics':   'Incident Analytics',
  'executive-dashboard':  'Executive Dashboard',
  'risk-heat-map':        'Risk Heat Map',
  'methodology':          'Methodology',
  'risk-incident-correlation': 'Risk & Incident Correlation',
  'appetite-breaches':    'Risks Outside Appetite',
  'decisions-needed':     'Decisions Needed',
  'control-evidence':     'Control Evidence',
};

export const AI_BLOCKS = new Set<BlockKey>([
  'ai-exec-summary',
  'executive-commentary',
  'top-risks',
  'top-emerging-risks',
  'major-incidents',
  'executive-dashboard',
]);