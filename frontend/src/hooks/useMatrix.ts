// src/hooks/useMatrix.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMatrixConfig, saveMatrixConfig } from '../services/matrix';
import type { MatrixConfigUpdate } from '../types/matrix';

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