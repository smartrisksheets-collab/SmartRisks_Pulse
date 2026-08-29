// src/services/submissions.ts

import { apiGet, apiPost } from './api';
import type {
  SubmissionToken,
  SubmissionTokenCreate,
  RiskSubmission,
  RiskSubmissionListItem,
  TriageMergePayload,
  TriageNotePayload,
  PromotePayload,
} from '../types/submission';

const BASE = '/api/v1/submissions';

// ── Token management ──────────────────────────────────────────────────────────

export function createToken(payload: SubmissionTokenCreate) {
  return apiPost<SubmissionToken>(`${BASE}/tokens`, payload);
}

export function listTokens() {
  return apiGet<SubmissionToken[]>(`${BASE}/tokens`);
}

export function revokeToken(tokenId: string) {
  return apiPost<{ ok: boolean }>(`${BASE}/tokens/${tokenId}/revoke`, {});
}

// ── Public form ───────────────────────────────────────────────────────────────

export function resolveToken(token: string) {
  return apiGet<{ label: string; department: string }>(`${BASE}/form/${token}`);
}

// ── Triage ────────────────────────────────────────────────────────────────────

export function getPendingCount() {
  return apiGet<{ count: number }>(`${BASE}/triage/count`);
}

export function listTriage() {
  return apiGet<RiskSubmissionListItem[]>(`${BASE}/triage`);
}

export function getSubmission(id: string) {
  return apiGet<RiskSubmission>(`${BASE}/triage/${id}`);
}

export function getDuplicates(id: string) {
  return apiGet<{ risk_id: string; snippet: string }[]>(`${BASE}/triage/${id}/duplicates`);
}

export function triageAccept(id: string) {
  return apiPost<RiskSubmission>(`${BASE}/triage/${id}/accept`, {});
}

export function triageMerge(id: string, payload: TriageMergePayload) {
  return apiPost<RiskSubmission>(`${BASE}/triage/${id}/merge`, payload);
}

export function triageReroute(id: string, payload: TriageNotePayload) {
  return apiPost<RiskSubmission>(`${BASE}/triage/${id}/reroute`, payload);
}

export function triageClose(id: string, payload: TriageNotePayload) {
  return apiPost<RiskSubmission>(`${BASE}/triage/${id}/close`, payload);
}

export function promote(id: string, payload: PromotePayload) {
  return apiPost<{ risk_id: string; reference: string }>(`${BASE}/triage/${id}/promote`, payload);
}