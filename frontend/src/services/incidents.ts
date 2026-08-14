// src/services/incidents.ts

import api from './api';
import { apiGet, apiPost, apiPatch, apiDelete } from './api';
import type { ApiResponse } from '../types/api';
import type { Incident, IncidentCreate, IncidentUpdate, IncidentListMeta, IncidentStats } from '../types/incident';

export interface ListIncidentsParams {
  page?:          number;
  page_size?:     number;
  incident_id?:   string;
  category?:      string;
  severity?:      string;
  status?:        string;
  business_unit?: string;
  search?:        string;
}

export interface IncidentListResponse {
  items: Incident[];
  meta:  IncidentListMeta;
}

export async function listIncidents(params: ListIncidentsParams = {}): Promise<IncidentListResponse> {
  const q = new URLSearchParams();
  if (params.page)          q.set('page',          String(params.page));
  if (params.page_size)     q.set('page_size',     String(params.page_size));
  if (params.incident_id)   q.set('incident_id',   params.incident_id);
  if (params.category)      q.set('category',      params.category);
  if (params.severity)      q.set('severity',      params.severity);
  if (params.status)        q.set('status',        params.status);
  if (params.business_unit) q.set('business_unit', params.business_unit);
  if (params.search)        q.set('search',        params.search);

  const qs  = q.toString();
  const url = `/api/v1/incidents${qs ? `?${qs}` : ''}`;
  const envelope = await api.get<ApiResponse<Incident[]>>(url);
  if (envelope.data.error) throw new Error(envelope.data.error);

  return {
    items: envelope.data.data ?? [],
    meta:  envelope.data.meta as unknown as IncidentListMeta,
  };
}

export async function createIncident(payload: IncidentCreate): Promise<Incident> {
  return apiPost<Incident>('/api/v1/incidents', payload);
}

export async function updateIncident(id: string, payload: IncidentUpdate): Promise<Incident> {
  return apiPatch<Incident>(`/api/v1/incidents/${id}`, payload);
}

export async function deleteIncident(id: string): Promise<void> {
  await apiDelete(`/api/v1/incidents/${id}`);
}

export async function getIncidentStats(): Promise<IncidentStats> {
  return apiGet<IncidentStats>('/api/v1/incidents/stats');
}

export async function generateAIImpact(id: string, force = false): Promise<{ mode: string; text: string }> {
  return apiPost(`/api/v1/incidents/${id}/ai/impact`, { force });
}

export async function generateAIActions(id: string, force = false): Promise<{ mode: string; text: string }> {
  return apiPost(`/api/v1/incidents/${id}/ai/actions`, { force });
}

export async function suggestCategory(description: string): Promise<string> {
  const res = await apiPost<{ suggestion: string }>('/api/v1/incidents/ai/suggest-category', { description });
  return res.suggestion;
}

export async function suggestSeverity(description: string): Promise<string> {
  const res = await apiPost<{ suggestion: string }>('/api/v1/incidents/ai/suggest-severity', { description });
  return res.suggestion;
}