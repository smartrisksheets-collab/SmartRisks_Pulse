// src/hooks/useAudit.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { apiDelete } from "../services/api";
import type { PaginatedResponse } from "../types/api";

export interface AuditEntry {
  id:         string;
  timestamp:  string;
  user_email: string;
  action:     string;
  module:     string;
  record_id:  string;
  summary:    string;
}

export interface AuditFilters {
  module?:     string;
  action?:     string;
  user_email?: string;
  date_range?: string;
  page?:       number;
  page_size?:  number;
}

interface AuditListResponse {
  data:  AuditEntry[];
  meta:  { total: number; page: number; page_size: number };
}

function buildQuery(filters: AuditFilters): string {
  const params = new URLSearchParams();
  if (filters.module)     params.set("module",     filters.module);
  if (filters.action)     params.set("action",     filters.action);
  if (filters.user_email) params.set("user_email", filters.user_email);
  if (filters.date_range) params.set("date_range", filters.date_range);
  params.set("page",      String(filters.page      ?? 1));
  params.set("page_size", String(filters.page_size ?? 50));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useAuditLog(filters: AuditFilters) {
  return useQuery<AuditListResponse>({
    queryKey: ["audit", filters],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<AuditEntry>>(`/api/v1/audit${buildQuery(filters)}`);
      if (res.data.error) throw new Error(res.data.error);
      return {
        data: res.data.data ?? [],
        meta: res.data.meta,
      };
    },
    staleTime: 30_000,
  });
}

export function useClearAuditLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete<{ cleared: boolean }>("/api/v1/audit"),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["audit"] }),
  });
}

export function buildAuditExportUrl(filters: AuditFilters): string {
  const params = new URLSearchParams();
  if (filters.module)     params.set("module",     filters.module);
  if (filters.action)     params.set("action",     filters.action);
  if (filters.user_email) params.set("user_email", filters.user_email);
  if (filters.date_range) params.set("date_range", filters.date_range);
  const qs = params.toString();
  return `/api/v1/audit/export.csv${qs ? "?" + qs : ""}`;
}