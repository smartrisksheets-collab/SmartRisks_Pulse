// src/services/appetite.ts

import { apiGet, apiPut } from './api';
import type { AppetiteThreshold, AppetiteThresholdUpsert } from '../types/settings';

export const fetchAppetites = (): Promise<AppetiteThreshold[]> =>
  apiGet<AppetiteThreshold[]>('/api/v1/appetite');

export const upsertAppetite = (payload: AppetiteThresholdUpsert): Promise<AppetiteThreshold> =>
  apiPut<AppetiteThreshold>('/api/v1/appetite', payload);