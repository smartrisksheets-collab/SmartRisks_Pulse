// src/services/matrix.ts

import { apiGet, apiPut } from './api';
import type { MatrixConfig, MatrixConfigUpdate } from '../types/matrix';

export async function fetchMatrixConfig(): Promise<MatrixConfig> {
  return apiGet<MatrixConfig>('/api/v1/matrix-config');
}

export async function saveMatrixConfig(payload: MatrixConfigUpdate): Promise<MatrixConfig> {
  return apiPut<MatrixConfig>('/api/v1/matrix-config', payload);
}