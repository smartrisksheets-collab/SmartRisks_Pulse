import { useQuery } from '@tanstack/react-query';
import { fetchHome } from '../services/home';
import type { HomeData } from '../types/home';

const FIVE_MINUTES = 5 * 60 * 1000;

export function useHome() {
  return useQuery<HomeData, Error>({
    // Under 'dashboard' so every existing dashboard invalidation also refreshes Home.
    queryKey: ['dashboard', 'home'],
    queryFn: fetchHome,
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
    refetchOnWindowFocus: false,
  });
}
