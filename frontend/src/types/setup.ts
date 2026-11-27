// What the setup wizard saved, handed to the Ready screen in the route state.

export type SetupLogoResult = 'none' | 'saved' | 'failed';

export interface SetupReadyState {
  workspace: string;
  organisation: string;
    categories: string[];
  logo: SetupLogoResult;
  logoError: string;
  // Appetite thresholds saved at finish, or skipped for later.
  appetiteSaved: number;
  appetiteSkipped: boolean;
}

export function isSetupReadyState(v: unknown): v is SetupReadyState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return typeof s.workspace === 'string'
    && Array.isArray(s.categories)
    && typeof s.logo === 'string'
    && typeof s.appetiteSaved === 'number';
}
