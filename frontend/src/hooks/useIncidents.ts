import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type { Incident, IncidentCreate, IncidentUpdate, IncidentStats } from '../types/incident';
import type { ListIncidentsParams } from '../services/incidents';
import * as incidentsApi from '../services/incidents';

const INCIDENTS_KEY = 'incidents' as const;
const STALE_MS      = 2 * 60 * 1000;

export function useIncidents(params: ListIncidentsParams = {}) {
  const qc = useQueryClient();

  // ── List query ──────────────────────────────────────────────────────────
  const query = useQuery({
    queryKey:        [INCIDENTS_KEY, params],
    queryFn:         () => incidentsApi.listIncidents(params),
    staleTime:       STALE_MS,
    placeholderData: keepPreviousData,
  });

  const incidents: Incident[] = query.data?.items      ?? [];
  const total: number          = query.data?.meta?.total ?? 0;

  // ── Stats: separate non-blocking query ─────────────────────────────────
  const statsQuery = useQuery<IncidentStats>({
    queryKey:  [INCIDENTS_KEY, 'stats'],
    queryFn:   incidentsApi.getIncidentStats,
    staleTime: STALE_MS,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: [INCIDENTS_KEY] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  }

  // ── Mutations ───────────────────────────────────────────────────────────
  const createM = useMutation({
    mutationFn: (payload: IncidentCreate) => incidentsApi.createIncident(payload),
    onSuccess: invalidate,
  });

  const updateM = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: IncidentUpdate }) =>
      incidentsApi.updateIncident(id, payload),
    onSuccess: invalidate,
  });

  const removeM = useMutation({
    mutationFn: (id: string) => incidentsApi.deleteIncident(id),
    onSuccess: invalidate,
  });

  // ── Adapters preserving existing call signatures ────────────────────────
  async function create(payload: IncidentCreate): Promise<Incident | null> {
    try {
      return await createM.mutateAsync(payload);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'Failed to create incident', { cause: e });
    }
  }

  async function update(id: string, payload: IncidentUpdate): Promise<Incident | null> {
    try {
      return await updateM.mutateAsync({ id, payload });
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'Failed to update incident', { cause: e });
    }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      await removeM.mutateAsync(id);
      return true;
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'Failed to delete incident', { cause: e });
    }
  }

  return {
    incidents,
    total,
    loading:      query.isLoading || query.isFetching,
    error:        query.error instanceof Error ? query.error.message : null,
    stats:        statsQuery.data         ?? null,
    statsLoading: statsQuery.isLoading,
    create,
    update,
    remove,
  };
}