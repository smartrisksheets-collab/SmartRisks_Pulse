// src/services/lookups.ts

import { apiGet, apiPatch } from './api';

export interface Lookups {
  category:          string[];
  treatment:         string[];
  likelihood:        string[];
  impact_level:      string[];
  risk_owner:        string[];
  incident_category: string[];
  incident_severity: string[];
  business_unit:     string[];
  updated_at:        string | null;
}

export type LookupPatch = Partial<Omit<Lookups, 'updated_at'>>;

export async function getLookups(): Promise<Lookups> {
  return apiGet<Lookups>('/api/v1/lookups');
}

export async function patchLookups(payload: LookupPatch): Promise<Lookups> {
  return apiPatch<Lookups>('/api/v1/lookups', payload);
}

export async function checkUsage(
  field: string,
  value: string
): Promise<{ field: string; value: string; count: number }> {
  return apiGet<{ field: string; value: string; count: number }>(
    `/api/v1/lookups/usage?field=${encodeURIComponent(field)}&value=${encodeURIComponent(value)}`
  );
}