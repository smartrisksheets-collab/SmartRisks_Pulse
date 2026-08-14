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
  updated_at:        string | null;
}

export type MatrixConfigUpdate = Omit<MatrixConfig, 'updated_at'>;

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