import { useQuery } from '@tanstack/react-query';
import { fetchDashboard } from '../services/dashboard';
import type { DashboardData } from '../types/dashboard';

const THIRTY_SECONDS = 30 * 1000;
const THREE_MINUTES = 3 * 60 * 1000;

export function useDashboard(days = 90) {
  return useQuery<DashboardData, Error>({
    queryKey: ['dashboard', days],
    queryFn: () => fetchDashboard(days),
    staleTime: THIRTY_SECONDS,
    refetchInterval: THREE_MINUTES,
    refetchOnWindowFocus: true,
  });
}