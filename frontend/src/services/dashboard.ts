import api from './api';
import type { DashboardData, ExecInsight } from '../types/dashboard';

export async function fetchDashboard(days = 90): Promise<DashboardData> {
  const res = await api.get<{ data: DashboardData }>('/api/v1/dashboard', {
    params: { days },
  });
  return res.data.data;
}

export async function runSnapshot(): Promise<{ month_key: string | null; written: boolean }> {
  const res = await api.post<{ data: { month_key: string | null; written: boolean } }>(
    '/api/v1/snapshots/run',
  );
  return res.data.data;
}

export async function fetchExecInsight(days = 90): Promise<ExecInsight> {
  const res = await api.get<{ data: ExecInsight }>('/api/v1/dashboard/exec-insights', {
    params: { days },
  });
  return res.data.data;
}