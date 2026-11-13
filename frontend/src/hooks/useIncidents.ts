// src/hooks/useIncidents.ts
// Incident log list, plus one shared refresh after any incident write.

import { useQuery, keepPreviousData, type QueryClient } from '@tanstack/react-query';
import type { IncidentRow } from '../types/incident';
import type { ListIncidentsParams } from '../services/incidents';
import * as incidentsApi from '../services/incidents';

const INCIDENTS_KEY = 'incidents' as const;
const STALE_MS      = 2 * 60 * 1000;

/** Refresh everything an incident write can change: the log, its counts, panels, Home and Analytics. */
export function invalidateIncidentQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: [INCIDENTS_KEY] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
  qc.invalidateQueries({ queryKey: ['risks', 'context'] });
}

export function useIncidents(params: ListIncidentsParams = {}) {
  const query = useQuery({
    queryKey:        [INCIDENTS_KEY, 'list', params],
    queryFn:         () => incidentsApi.listIncidents(params),
    staleTime:       STALE_MS,
    placeholderData: keepPreviousData,
  });

  const incidents: IncidentRow[] = query.data?.items ?? [];
  const total: number            = query.data?.meta?.total ?? 0;

  return {
    incidents,
    total,
    loading: query.isLoading || query.isFetching,
    error:   query.error instanceof Error ? query.error.message : null,
  };
}
