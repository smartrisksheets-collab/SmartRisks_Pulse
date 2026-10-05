// src/types/matrix.ts

export interface MatrixConfig {
  likelihood_scale:  number;
  impact_scale:      number;
  band_count:        number;
  band_1_label:      string;
  band_2_label:      string;
  band_3_label:      string;
  band_4_label:      string;
  band_low_min:      number;
  band_low_max:      number;
  band_medium_min:   number;
  band_medium_max:   number;
  band_high_min:     number;
  band_high_max:     number;
  band_critical_min: number;
  band_critical_max: number;
  band_extreme_min:  number;
  band_extreme_max:  number;
  band_5_label:      string;
  ce_scale:          number;
  ce_labels:         Record<string, string>;
  ce_scale_switch_enabled: boolean;
  ce_options:        CeOption[];
  updated_at:        string | null;
}

export interface CeOption {
  value: number | null;
  label: string;
}

export type MatrixConfigUpdate = Omit<
  MatrixConfig,
  'updated_at' | 'ce_scale' | 'ce_labels' | 'ce_scale_switch_enabled' | 'ce_options'
>;

export interface CeConfigUpdate {
  ce_scale:  number;
  ce_labels: Record<string, string>;
  confirm:   boolean;
}

export interface CeBlockedRisk {
  risk_id:               string;
  description:           string;
  control_effectiveness: number;
}

export interface CeScalePreview {
  current_scale:  number;
  target_scale:   number;
  affected_count: number;
  blocked_count:  number;
  blocked_risks:  CeBlockedRisk[];
}

export const CE_LABEL_MAX = 40;

export const CE_SCALE_OPTIONS = [
  { value: 5, label: '5 levels (20% steps)' },
  { value: 4, label: '4 levels (25% steps)' },
] as const;

export const CE_FALLBACK_OPTIONS: CeOption[] = [
  { value: null, label: 'Not assessed' },
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ value: i, label: String(i) })),
];

export function ceOptionLabel(cfg: MatrixConfig | undefined, level: number | null): string {
  const opts = cfg?.ce_options ?? CE_FALLBACK_OPTIONS;
  return opts.find((o) => o.value === level)?.label ?? (level === null ? 'Not assessed' : String(level));
}

export function ceLevelKeys(scale: number): string[] {
  return Array.from({ length: scale + 1 }, (_, i) => String(i));
}

export const MATRIX_DEFAULTS: MatrixConfigUpdate = {
  likelihood_scale: 5,   impact_scale: 5,
  band_count: 4,
  band_1_label: 'Low',   band_2_label: 'Medium',
  band_3_label: 'High',  band_4_label: 'Critical',
  band_5_label: 'Extreme',
  band_low_min: 1,       band_low_max: 4,
  band_medium_min: 5,    band_medium_max: 9,
  band_high_min: 10,     band_high_max: 16,
  band_critical_min: 17, band_critical_max: 25,
  band_extreme_min: 21,  band_extreme_max: 25,
};