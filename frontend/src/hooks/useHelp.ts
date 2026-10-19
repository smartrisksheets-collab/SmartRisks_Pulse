import { useQuery } from '@tanstack/react-query';
import { getHelpEntries } from '../services/help';
import type { HelpEntry } from '../types/help';

export function useHelpEntries() {
  return useQuery<HelpEntry[]>({
    queryKey:  ['help'],
    queryFn:   getHelpEntries,
    staleTime: 5 * 60_000,
  });
}