// src/hooks/useUsers.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "../services/api";

export interface WorkspaceMember {
  id:          string;
  account_id:  string;
  email:       string;
  name:        string | null;
  role:        string;
  status:      string;
  permissions: Record<string, boolean> | null;
  last_login:  string | null;
}

export interface AddMemberPayload {
  email: string;
  name:  string;
  role:  string;
}

export interface UpdateMemberPayload {
  name?:              string;
  role?:              string;
  permissions?:       Record<string, boolean>;
  reset_permissions?: boolean;
}

const QK = ["users"] as const;

export function useUsers() {
  return useQuery<WorkspaceMember[]>({
    queryKey: QK,
    queryFn:  () => apiGet<WorkspaceMember[]>("/api/v1/users"),
    staleTime: 60_000,
  });
}

export function useAddUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddMemberPayload) =>
      apiPost<{ id: string }>("/api/v1/users", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateMemberPayload }) =>
      apiPatch<{ id: string }>(`/api/v1/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/api/v1/users/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useRemoveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/api/v1/users/${id}/remove`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useReactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ id: string }>(`/api/v1/users/${id}/reactivate`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}