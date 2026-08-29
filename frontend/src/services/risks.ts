// src/services/risks.ts

import api from './api';
import { apiGet, apiPost, apiPatch, apiDelete } from './api';
import type { ApiResponse } from '../types/api';
import type {
  Risk, RiskCreate, RiskUpdate, RiskListMeta,
  BulkImportRow, BulkImportResult,
  AIInsightRequest, AIInsightResult,
  RecycleBinItem, RiskStats,
} from '../types/risk';

export interface ListRisksParams {
  page?:      number;
  page_size?: number;
  risk_id?:   string;
  category?:  string;
  level?:     string;
  treatment?: string;
  owner?:     string;
  search?:    string;
  undecided?: boolean;
}

export interface RiskListResponse {
  items: Risk[];
  meta:  RiskListMeta;
}

export async function listRisks(params: ListRisksParams = {}): Promise<RiskListResponse> {
  const query = new URLSearchParams();
  if (params.page)      query.set('page',      String(params.page));
  if (params.page_size) query.set('page_size', String(params.page_size));
  if (params.risk_id)   query.set('risk_id',   params.risk_id);
  if (params.category)  query.set('category',  params.category);
  if (params.level)     query.set('level',      params.level);
  if (params.treatment) query.set('treatment',  params.treatment);
  if (params.owner)     query.set('owner',      params.owner);
  if (params.search)    query.set('search',     params.search);
  if (params.undecided) query.set('undecided',  'true');

  const qs  = query.toString();
  const url = `/api/v1/risks${qs ? `?${qs}` : ''}`;
  const envelope = await api.get<ApiResponse<Risk[]>>(url);
  if (envelope.data.error) throw new Error(envelope.data.error);

  return {
    items: envelope.data.data ?? [],
    meta:  envelope.data.meta as unknown as RiskListMeta,
  };
}

export async function getRisk(id: string): Promise<Risk> {
  return apiGet<Risk>(`/api/v1/risks/${id}`);
}

export async function createRisk(payload: RiskCreate): Promise<Risk> {
  return apiPost<Risk>('/api/v1/risks', payload);
}

export async function updateRisk(id: string, payload: RiskUpdate): Promise<Risk> {
  return apiPatch<Risk>(`/api/v1/risks/${id}`, payload);
}

export async function deleteRisk(id: string): Promise<void> {
  await apiDelete(`/api/v1/risks/${id}`);
}

export async function bulkImport(rows: BulkImportRow[]): Promise<BulkImportResult> {
  return apiPost<BulkImportResult>('/api/v1/risks/import', { rows });
}

export async function generateAI(payload: AIInsightRequest): Promise<AIInsightResult> {
  return apiPost<AIInsightResult>('/api/v1/risks/ai', payload);
}

export interface StatsParams {
  category?:  string;
  level?:     string;
  treatment?: string;
  owner?:     string;
  search?:    string;
  undecided?: boolean;
}

export async function getStats(params: StatsParams = {}): Promise<RiskStats> {
  const qs = new URLSearchParams();
  if (params.category)  qs.set('category',  params.category);
  if (params.level)     qs.set('level',      params.level);
  if (params.treatment) qs.set('treatment',  params.treatment);
  if (params.owner)     qs.set('owner',      params.owner);
  if (params.search)    qs.set('search',     params.search);
  const query = qs.toString();
  return apiGet<RiskStats>(`/api/v1/risks/stats${query ? `?${query}` : ''}`);
}

export async function listBin(itemType?: string): Promise<RecycleBinItem[]> {
  const qs = itemType ? `?item_type=${itemType}` : '';
  return apiGet<RecycleBinItem[]>(`/api/v1/recycle${qs}`);
}

export async function restoreItem(binId: string): Promise<void> {
  await apiPost(`/api/v1/recycle/${binId}/restore`, {});
}

export async function permanentDelete(binId: string): Promise<void> {
  await apiDelete(`/api/v1/recycle/${binId}`);
}