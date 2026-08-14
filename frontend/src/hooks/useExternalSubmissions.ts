// src/hooks/useExternalSubmissions.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchPendingSubmissions,
  fetchPendingCount,
  approveSubmission,
  returnSubmission,
} from '../services/external';

export function usePendingSubmissions() {
  return useQuery({
    queryKey: ['external', 'pending'],
    queryFn:  fetchPendingSubmissions,
  });
}

export function usePendingCount() {
  return useQuery({
    queryKey: ['external', 'pending', 'count'],
    queryFn:  fetchPendingCount,
  });
}

export function useApproveSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      approveSubmission(id, notes ?? ''),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['external', 'pending'] });
      qc.invalidateQueries({ queryKey: ['risks'] });
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useReturnSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      returnSubmission(id, message),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['external', 'pending'] });
    },
  });
}