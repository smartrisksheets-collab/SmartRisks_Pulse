// src/hooks/useLookups.ts

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getLookups, patchLookups } from '../services/lookups';
import type { Lookups, LookupPatch } from '../services/lookups';

const LOOKUPS_KEY = ['lookups'] as const;

interface UseLookups {
  lookups:  Lookups | null;
  loading:  boolean;
  error:    string | null;
  refresh:  () => Promise<void>;
  patch:    (updates: LookupPatch) => Promise<Lookups | null>;
}

const _DEFAULTS: Lookups = {
  category:          ['Strategic', 'Operational', 'Financial', 'Compliance', 'Reputational', 'Technical'],
  treatment:         ['Mitigate', 'Avoid', 'Transfer', 'Accept'],
  likelihood:        ['1', '2', '3', '4', '5'],
  impact_level:      ['1', '2', '3', '4', '5'],
  risk_owner:        [],
  incident_category: ['Cybersecurity', 'IT Operations', 'Physical Security', 'Data Protection', 'Compliance', 'Other'],
  incident_severity: ['Low', 'Medium', 'High', 'Very High'],
  business_unit:     [],
  updated_at:        null,
};

function _merge(data: Lookups): Lookups {
  return {
    ..._DEFAULTS,
    ...data,
    risk_owner:        data.risk_owner.length        ? data.risk_owner        : _DEFAULTS.risk_owner,
    business_unit:     data.business_unit.length     ? data.business_unit     : _DEFAULTS.business_unit,
    incident_category: data.incident_category.length ? data.incident_category : _DEFAULTS.incident_category,
  };
}

export function useLookups(): UseLookups {
  const queryClient = useQueryClient();

  const query = useQuery<Lookups>({
    queryKey: LOOKUPS_KEY,
    queryFn:  getLookups,
    select:   _merge,
    staleTime: 1000 * 60 * 5,
    placeholderData: _DEFAULTS,
  });

  const mutation = useMutation({
    mutationFn: patchLookups,
    onSuccess: (updated) => {
      queryClient.setQueryData(LOOKUPS_KEY, _merge(updated));
    },
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: LOOKUPS_KEY });
  }, [queryClient]);

  const patch = useCallback(async (updates: LookupPatch): Promise<Lookups | null> => {
    try {
      const result = await mutation.mutateAsync(updates);
      return result;
    } catch {
      return null;
    }
  }, [mutation]);

  return {
    lookups:  query.data ?? null,
    loading:  query.isLoading,
    error:    query.error instanceof Error ? query.error.message : null,
    refresh,
    patch,
  };
}