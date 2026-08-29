// src/hooks/useSubmissions.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as svc from '../services/submissions';
import type { SubmissionTokenCreate, TriageMergePayload, TriageNotePayload, PromotePayload } from '../types/submission';

const TOKENS_KEY  = ['submissions', 'tokens'] as const;
const TRIAGE_KEY  = ['submissions', 'triage'] as const;
const COUNT_KEY   = ['submissions', 'triage', 'count'] as const;

export function useTokens() {
  return useQuery({
    queryKey: TOKENS_KEY,
    queryFn:  svc.listTokens,
    staleTime: 60_000,
  });
}

export function useCreateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmissionTokenCreate) => svc.createToken(payload),
    onSuccess:  () => qc.invalidateQueries({ queryKey: TOKENS_KEY }),
  });
}

export function useRevokeToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) => svc.revokeToken(tokenId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: TOKENS_KEY }),
  });
}

export function useTriagePendingCount() {
  return useQuery({
    queryKey: COUNT_KEY,
    queryFn:  svc.getPendingCount,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useTriageQueue() {
  return useQuery({
    queryKey: TRIAGE_KEY,
    queryFn:  svc.listTriage,
    staleTime: 30_000,
  });
}

export function useSubmission(id: string | null) {
  return useQuery({
    queryKey: ['submissions', 'triage', id],
    queryFn:  () => svc.getSubmission(id!),
    enabled:  !!id,
    staleTime: 30_000,
  });
}

export function useDuplicates(id: string | null) {
  return useQuery({
    queryKey: ['submissions', 'triage', id, 'duplicates'],
    queryFn:  () => svc.getDuplicates(id!),
    enabled:  !!id,
    staleTime: 120_000,
  });
}

function useTriageInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: TRIAGE_KEY });
    qc.invalidateQueries({ queryKey: COUNT_KEY });
  };
}

export function useTriageAccept() {
  const invalidate = useTriageInvalidate();
  return useMutation({
    mutationFn: (id: string) => svc.triageAccept(id),
    onSuccess:  invalidate,
  });
}

export function useTriageMerge() {
  const invalidate = useTriageInvalidate();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TriageMergePayload }) =>
      svc.triageMerge(id, payload),
    onSuccess: invalidate,
  });
}

export function useTriageReroute() {
  const invalidate = useTriageInvalidate();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TriageNotePayload }) =>
      svc.triageReroute(id, payload),
    onSuccess: invalidate,
  });
}

export function useTriageClose() {
  const invalidate = useTriageInvalidate();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TriageNotePayload }) =>
      svc.triageClose(id, payload),
    onSuccess: invalidate,
  });
}

export function usePromote() {
  const invalidate = useTriageInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PromotePayload }) =>
      svc.promote(id, payload),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['risks'] });
    },
  });
}