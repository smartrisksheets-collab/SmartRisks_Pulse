// src/hooks/useRisks.ts

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  Risk, RiskCreate, RiskUpdate, RiskQuota,
  BulkImportRow, BulkImportResult,
  AIInsightRequest, AIInsightResult,
} from '../types/risk';
import type { ListRisksParams } from '../services/risks';
import * as risksApi from '../services/risks';

interface UseRisksState {
  risks:    Risk[];
  quota:    RiskQuota | null;
  total:    number;
  loading:  boolean;
  error:    string | null;
}

export function useRisks() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<UseRisksState>({
    risks: [], quota: null, total: 0, loading: false, error: null,
  });

  const setLoading = (loading: boolean) =>
    setState(s => ({ ...s, loading, error: loading ? null : s.error }));

  const setError = (error: string) =>
    setState(s => ({ ...s, error, loading: false }));

  const fetch = useCallback(async (params: ListRisksParams = {}) => {
    setLoading(true);
    try {
      const { items, meta } = await risksApi.listRisks(params);
      setState({ risks: items, quota: meta.quota, total: meta.total, loading: false, error: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load risks');
    }
  }, []);

  const create = useCallback(async (payload: RiskCreate): Promise<Risk | null> => {
    setLoading(true);
    try {
      const risk = await risksApi.createRisk(payload);
      setState(s => ({
        ...s, loading: false, error: null,
        risks: [risk, ...s.risks],
        total: s.total + 1,
        quota: s.quota ? { ...s.quota, current: s.quota.current + 1 } : s.quota,
      }));
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      return risk;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create risk');
      return null;
    }
  }, []);

  const update = useCallback(async (id: string, payload: RiskUpdate): Promise<Risk | null> => {
    setLoading(true);
    try {
      const updated = await risksApi.updateRisk(id, payload);
      setState(s => ({
        ...s, loading: false, error: null,
        risks: s.risks.map(r => r.id === id ? updated : r),
      }));
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      return updated;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update risk');
      return null;
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    try {
      await risksApi.deleteRisk(id);
      setState(s => ({
        ...s, loading: false, error: null,
        risks: s.risks.filter(r => r.id !== id),
        total: Math.max(0, s.total - 1),
        quota: s.quota ? { ...s.quota, current: Math.max(0, s.quota.current - 1) } : s.quota,
      }));
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete risk');
      return false;
    }
  }, []);

  const importRisks = useCallback(async (rows: BulkImportRow[]): Promise<BulkImportResult | null> => {
    setLoading(true);
    try {
      const result = await risksApi.bulkImport(rows);
      setState(s => ({ ...s, loading: false, error: null }));
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Import failed';
      setError(msg);
      throw new Error(msg, { cause: e });
    }
  }, []);

  const generateAI = useCallback(async (payload: AIInsightRequest): Promise<AIInsightResult | null> => {
    setLoading(true);
    try {
      const result = await risksApi.generateAI(payload);
      setState(s => ({ ...s, loading: false, error: null }));
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI generation failed');
      return null;
    }
  }, []);

  return { ...state, fetch, create, update, remove, importRisks, generateAI };
}