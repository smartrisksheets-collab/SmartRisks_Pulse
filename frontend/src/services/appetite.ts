// src/services/appetite.ts

import { apiGet, apiPut, apiDelete } from './api';
import type { AppetiteThreshold, AppetiteThresholdUpsert } from '../types/settings';

export const fetchAppetites = (): Promise<AppetiteThreshold[]> =>
  apiGet<AppetiteThreshold[]>('/api/v1/appetite');

export const upsertAppetite = (payload: AppetiteThresholdUpsert): Promise<AppetiteThreshold> =>
  apiPut<AppetiteThreshold>('/api/v1/appetite', payload);

export const deleteAppetite = (category: string): Promise<{ deleted: boolean }> =>
  apiDelete<{ deleted: boolean }>(`/api/v1/appetite/${encodeURIComponent(category)}`);