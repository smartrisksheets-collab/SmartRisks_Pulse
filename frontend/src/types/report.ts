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
  | 'key-risk-movements';

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
  positive_signals: string[];
  key_risks: string[];
  areas_for_attention: string[];
  findings: string[];
  narrative: string;
}

export interface Recommendation {
  title: string;
  priority: string;
  owner: string;
  due: string;
  outcome: string;
  body: string;
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

export interface KeyRiskMovementsData {
  has_data: boolean;
  escalations: unknown[];
  reductions: unknown[];
  new_risks: unknown[];
  removed_risks: unknown[];
  prev_month_label: string;
  curr_month_label: string;
  narrative: string;
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
  | KeyRiskMovementsData;

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

export type DatePreset = 'Last 30 days' | 'Last 3 months' | 'Last 6 months' | 'Last 12 months' | 'custom';

export interface DateRange {
  date_from: string | null;
  date_to:   string;
}

// ── Build step state ───────────────────────────────────────────────────────────

export type BuildStep = 1 | 2 | 3;

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
  'key-risk-movements':   'Key Risk Movements',
};