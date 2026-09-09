// src/hooks/useIncidentSeverity.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSeverityConfig,
  fetchBreachPreview,
  upsertLevels,
  deleteSeverityLevel,
  upsertSla,
  upsertEscalation,
} from '../services/incident_severity';
import type {
  SeverityLevelResponse,
  SeverityLevelUpsert,
  EscalationRuleUpsert,
} from '../types/incident_severity';

const CONFIG_KEY  = ['incident-severity-config']  as const;
const PREVIEW_KEY = ['incident-severity-preview'] as const;

interface SlaDraftByIndex {
  target_value:  number;
  target_unit:   'hours' | 'days';
  notify_on_log: string | null;
}

interface SavePayload {
  levels:     SeverityLevelUpsert[];
  slaByIndex: SlaDraftByIndex[];
  escalation: EscalationRuleUpsert;
}

export function useIncidentSeverity() {
  const qc = useQueryClient();

  function invalidate() {
    qc.invalidateQueries({ queryKey: CONFIG_KEY });
    qc.invalidateQueries({ queryKey: PREVIEW_KEY });
  }

  const config = useQuery({
    queryKey: CONFIG_KEY,
    queryFn:  fetchSeverityConfig,
    staleTime: 5 * 60 * 1000,
  });

  const preview = useQuery({
    queryKey: PREVIEW_KEY,
    queryFn:  fetchBreachPreview,
    staleTime: 60 * 1000,
  });

  const saveConfig = useMutation({
    mutationFn: async (payload: SavePayload) => {
      // Step 1: upsert levels, get back saved rows with IDs in sort_order
      const savedLevels: SeverityLevelResponse[] = await upsertLevels(payload.levels);

      // Step 2: map SLA drafts to level IDs by position
      await upsertSla(
        payload.slaByIndex.map((s, i) => ({
          severity_id:   savedLevels[i]?.id ?? '',
          target_value:  s.target_value,
          target_unit:   s.target_unit,
          notify_on_log: s.notify_on_log,
        })),
      );

      // Step 3: upsert escalation rules
      await upsertEscalation(payload.escalation);
    },
    onSuccess: invalidate,
  });

  const deleteLevel = useMutation({
    mutationFn: ({ levelId, reassignTo }: { levelId: string; reassignTo?: string }) =>
      deleteSeverityLevel(levelId, reassignTo),
    onSuccess: invalidate,
  });

  return { config, preview, saveConfig, deleteLevel };
}