import { useQuery } from '@tanstack/react-query';
import { fetchDashboard } from '../services/dashboard';
import type { DashboardData } from '../types/dashboard';

const FIVE_MINUTES = 5 * 60 * 1000;

export function useDashboard(days = 90) {
  return useQuery<DashboardData, Error>({
    queryKey: ['dashboard', days],
    queryFn: () => fetchDashboard(days),
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
    refetchOnWindowFocus: false,
  });
}