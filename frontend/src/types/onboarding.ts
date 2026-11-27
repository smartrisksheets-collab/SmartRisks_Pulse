// Setup wizard: shapes of GET/PUT /api/v1/onboarding/draft, options and finish.

export interface OnboardingData {
  workspace_name: string | null;
  org_name: string | null;
  sector: string | null;
  categories: string[];
  // Threshold per category, 1 to the matrix maximum.
  appetite: Record<string, number>;
  appetite_skipped: boolean;
}

export interface OnboardingDraft {
  step: number;
  data: OnboardingData;
  updated_at: string;
}

export interface OnboardingBand {
  label: string;
  min: number;
  max: number;
}

export interface OnboardingOptions {
  sectors: string[];
  default_categories: string[];
  min_categories: number;
  max_categories: number;
  matrix_max: number;
  bands: OnboardingBand[];
  // Band number (1 = lowest) for each score 1..matrix_max, from the backend.
  band_for_score: number[];
  appetite_start: number;
  appetite_note: string;
  // SmartRisk suggested categories and starting thresholds per sector.
  suggestions: Record<string, { category: string; threshold: number }[]>;
  guide_url: string;
}

export interface OnboardingFinishResult {
  workspace_id: string;
  workspace_name: string;
  categories: string[];
  appetite_saved: number;
}

export const EMPTY_ONBOARDING: OnboardingData = {
  workspace_name: null,
  org_name: null,
  sector: null,
  categories: [],
  appetite: {},
  appetite_skipped: false,
};
