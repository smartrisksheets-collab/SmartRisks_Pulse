import api from './api';
import type { HomeData } from '../types/home';

export async function fetchHome(): Promise<HomeData> {
  const res = await api.get<{ data: HomeData }>('/api/v1/home');
  return res.data.data;
}
