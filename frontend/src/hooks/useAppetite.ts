// src/hooks/useAppetite.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAppetites, upsertAppetite } from '../services/appetite';
import type { AppetiteThresholdUpsert } from '../types/settings';

const APPETITE_KEY = ['appetite'] as const;

export function useAppetite() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: APPETITE_KEY,
    queryFn:  fetchAppetites,
    staleTime: 5 * 60 * 1000,
  });

  const save = useMutation({
    mutationFn: (payload: AppetiteThresholdUpsert) => upsertAppetite(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: APPETITE_KEY });
      qc.invalidateQueries({ queryKey: ['risks'] });
    },
  });

  return { query, save };
}