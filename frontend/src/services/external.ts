// src/services/external.ts
import { apiGet, apiPost } from './api';
import type {
  PendingListResponse,
  PendingCountResponse,
} from '../types/external';

const BASE = '/api/v1';

export function fetchPendingCount(): Promise<PendingCountResponse> {
  return apiGet<PendingCountResponse>(`${BASE}/external/pending/count`);
}

export function fetchPendingSubmissions(): Promise<PendingListResponse> {
  return apiGet<PendingListResponse>(`${BASE}/external/pending`);
}

export function approveSubmission(
  submissionId:  string,
  reviewerNotes: string = '',
): Promise<{ created_id: string; submission_type: string }> {
  return apiPost(`${BASE}/external/${submissionId}/approve`, {
    reviewer_notes: reviewerNotes,
  });
}

export function returnSubmission(
  submissionId:  string,
  returnMessage: string,
): Promise<{ ok: boolean }> {
  return apiPost(`${BASE}/external/${submissionId}/return`, {
    return_message: returnMessage,
  });
}