// src/services/incident_severity.ts

import { apiGet, apiPut, apiDelete } from './api';
import type {
  IncidentSeverityConfig,
  BreachPreviewResponse,
  SeverityLevelResponse,
  SlaTargetResponse,
  EscalationRuleResponse,
  SeverityLevelUpsert,
  SlaTargetUpsert,
  EscalationRuleUpsert,
} from '../types/incident_severity';

const BASE = '/api/v1/incident-severity';

export function fetchSeverityConfig(): Promise<IncidentSeverityConfig> {
  return apiGet<IncidentSeverityConfig>(`${BASE}/config`);
}

export function fetchBreachPreview(): Promise<BreachPreviewResponse> {
  return apiGet<BreachPreviewResponse>(`${BASE}/preview`);
}

export function upsertLevels(
  payload: SeverityLevelUpsert[],
): Promise<SeverityLevelResponse[]> {
  return apiPut<SeverityLevelResponse[]>(`${BASE}/levels`, payload);
}

export function deleteSeverityLevel(
  levelId: string,
  reassignTo?: string,
): Promise<void> {
  const url = reassignTo
    ? `${BASE}/levels/${levelId}?reassign_to=${reassignTo}`
    : `${BASE}/levels/${levelId}`;
  return apiDelete<void>(url);
}

export function upsertSla(payload: SlaTargetUpsert[]): Promise<SlaTargetResponse[]> {
  return apiPut<SlaTargetResponse[]>(`${BASE}/sla`, payload);
}

export function upsertEscalation(
  payload: EscalationRuleUpsert,
): Promise<EscalationRuleResponse> {
  return apiPut<EscalationRuleResponse>(`${BASE}/escalation`, payload);
}