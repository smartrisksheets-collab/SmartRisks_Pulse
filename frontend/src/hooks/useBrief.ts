// src/hooks/useBrief.ts
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchBriefPreview, sendTestBrief } from "../services/briefs";

export function useBriefPreview(enabled: boolean) {
  return useQuery({
    queryKey: ["brief-preview"],
    queryFn:  fetchBriefPreview,
    enabled,
    staleTime: 60_000,
    retry:     false,
  });
}

export function useSendTestBrief() {
  return useMutation({ mutationFn: sendTestBrief });
}