// src/hooks/useMatrix.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMatrixConfig, saveMatrixConfig, saveCeConfig } from '../services/matrix';
import type { MatrixConfigUpdate, CeConfigUpdate } from '../types/matrix';

export function useMatrix() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['matrix-config'],
    queryFn:  fetchMatrixConfig,
    staleTime: 5 * 60 * 1000,
  });

  const save = useMutation({
    mutationFn: (payload: MatrixConfigUpdate) => saveMatrixConfig(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matrix-config'] });
      qc.invalidateQueries({ queryKey: ['risks'] });
    },
  });

  return { query, save };
}

export function useSaveCeConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CeConfigUpdate) => saveCeConfig(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matrix-config'] });
      qc.invalidateQueries({ queryKey: ['risks'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['exec-insights'] });
    },
  });
}