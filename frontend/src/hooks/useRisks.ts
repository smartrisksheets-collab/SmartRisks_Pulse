import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  Risk, RiskCreate, RiskUpdate, RiskQuota,
  BulkImportRow, BulkImportResult,
  AIInsightRequest, AIInsightResult,
} from '../types/risk';
import type { ListRisksParams } from '../services/risks';
import * as risksApi from '../services/risks';

const RISKS_KEY = 'risks' as const;
const STALE_MS  = 2 * 60 * 1000;

export function useRisks(params: ListRisksParams = {}) {
  const qc = useQueryClient();

  // ── List query ──────────────────────────────────────────────────────────
  const query = useQuery({
    queryKey:        [RISKS_KEY, params],
    queryFn:         () => risksApi.listRisks(params),
    staleTime:       STALE_MS,
    placeholderData: keepPreviousData,
  });

  const risks: Risk[]           = query.data?.items        ?? [];
  const quota: RiskQuota | null = query.data?.meta?.quota  ?? null;
  const total: number           = query.data?.meta?.total  ?? 0;

  function invalidate() {
    qc.invalidateQueries({ queryKey: [RISKS_KEY] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['exec-insights'] });
  }

  // ── Mutations ───────────────────────────────────────────────────────────
  const createM = useMutation({
    mutationFn: (payload: RiskCreate) => risksApi.createRisk(payload),
    onSuccess: invalidate,
  });

  const updateM = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RiskUpdate }) =>
      risksApi.updateRisk(id, payload),
    onSuccess: invalidate,
  });

  const removeM = useMutation({
    mutationFn: (id: string) => risksApi.deleteRisk(id),
    onSuccess: invalidate,
  });

  const importM = useMutation({
    mutationFn: (rows: BulkImportRow[]) => risksApi.bulkImport(rows),
    onSuccess: invalidate,
  });

  const aiM = useMutation({
    mutationFn: (payload: AIInsightRequest) => risksApi.generateAI(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: [RISKS_KEY] }),
  });

  // ── Adapters preserving existing call signatures ────────────────────────
  async function create(payload: RiskCreate): Promise<Risk | null> {
    try {
      return await createM.mutateAsync(payload);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'Failed to create risk', { cause: e });
    }
  }

  async function update(id: string, payload: RiskUpdate): Promise<Risk | null> {
    try {
      return await updateM.mutateAsync({ id, payload });
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'Failed to update risk', { cause: e });
    }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      await removeM.mutateAsync(id);
      return true;
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'Failed to delete risk', { cause: e });
    }
  }

  async function importRisks(rows: BulkImportRow[]): Promise<BulkImportResult | null> {
    try {
      return await importM.mutateAsync(rows);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'Import failed', { cause: e });
    }
  }

  async function generateAI(payload: AIInsightRequest): Promise<AIInsightResult | null> {
    try {
      return await aiM.mutateAsync(payload);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'AI generation failed', { cause: e });
    }
  }

  return {
    risks,
    quota,
    total,
    loading:       query.isLoading || query.isFetching,
    error:         query.error instanceof Error ? query.error.message : null,
    create,
    update,
    remove,
    importRisks,
    generateAI,
  };
}