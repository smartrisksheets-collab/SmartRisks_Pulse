// src/hooks/useIncidents.ts

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Incident, IncidentCreate, IncidentUpdate, IncidentStats } from '../types/incident';
import type { ListIncidentsParams } from '../services/incidents';
import * as incidentsApi from '../services/incidents';

interface UseIncidentsState {
  incidents: Incident[];
  total:     number;
  loading:   boolean;
  error:     string | null;
}

export function useIncidents() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<UseIncidentsState>({
    incidents: [], total: 0, loading: false, error: null,
  });
  const [stats, setStats] = useState<IncidentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const setLoading = (loading: boolean) =>
    setState(s => ({ ...s, loading, error: loading ? null : s.error }));

  const setError = (error: string) =>
    setState(s => ({ ...s, error, loading: false }));

  const fetch = useCallback(async (params: ListIncidentsParams = {}) => {
    setLoading(true);
    try {
      const { items, meta } = await incidentsApi.listIncidents(params);
      setState({ incidents: items, total: meta.total, loading: false, error: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load incidents');
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const s = await incidentsApi.getIncidentStats();
      setStats(s);
    } catch {
      // stats are non-blocking
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const create = useCallback(async (payload: IncidentCreate): Promise<Incident | null> => {
    setLoading(true);
    try {
      const inc = await incidentsApi.createIncident(payload);
      setState(s => ({ ...s, loading: false, error: null, incidents: [...s.incidents, inc], total: s.total + 1 }));
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      return inc;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create incident');
      return null;
    }
  }, []);

  const update = useCallback(async (id: string, payload: IncidentUpdate): Promise<Incident | null> => {
    setLoading(true);
    try {
      const updated = await incidentsApi.updateIncident(id, payload);
      setState(s => ({ ...s, loading: false, error: null, incidents: s.incidents.map(i => i.id === id ? updated : i) }));
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      return updated;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update incident');
      return null;
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    try {
      await incidentsApi.deleteIncident(id);
      setState(s => ({ ...s, loading: false, error: null, incidents: s.incidents.filter(i => i.id !== id), total: Math.max(0, s.total - 1) }));
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete incident');
      return false;
    }
  }, []);

  return { ...state, stats, statsLoading, fetch, fetchStats, create, update, remove };
}