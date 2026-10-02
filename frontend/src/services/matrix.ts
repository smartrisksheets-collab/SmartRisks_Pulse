// src/services/matrix.ts

import { apiGet, apiPut } from './api';
import type { MatrixConfig, MatrixConfigUpdate, CeConfigUpdate, CeScalePreview } from '../types/matrix';

export async function fetchMatrixConfig(): Promise<MatrixConfig> {
  return apiGet<MatrixConfig>('/api/v1/matrix-config');
}

export async function saveMatrixConfig(payload: MatrixConfigUpdate): Promise<MatrixConfig> {
  return apiPut<MatrixConfig>('/api/v1/matrix-config', payload);
}

export async function saveCeConfig(payload: CeConfigUpdate): Promise<MatrixConfig> {
  return apiPut<MatrixConfig>('/api/v1/matrix-config/control-effectiveness', payload);
}

export async function previewCeScale(targetScale: number): Promise<CeScalePreview> {
  return apiGet<CeScalePreview>(`/api/v1/matrix-config/control-effectiveness/preview?target_scale=${targetScale}`);
}