import axios from 'axios';
import type { AxiosResponse } from 'axios';
import type { ApiResponse } from '../types/api';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const status = error.response?.status;
    const isAuthRoute = ['/login', '/register', '/forgot-password', '/reset-password'].includes(window.location.pathname);

    if (status === 401 && !isAuthRoute) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    if (status === 403) {
      const msg: string = error.response?.data?.error ?? '';
      if (
        msg === 'Your trial has expired.' ||
        msg === 'This workspace has expired. Please renew to continue.'
      ) {
        if (window.location.pathname !== '/expired') {
          window.location.href = '/expired';
        }
        return Promise.reject(error);
      }
    }

    const backendMessage = error.response?.data?.error;
    if (backendMessage) {
      return Promise.reject(new Error(backendMessage));
    }

    if (status === 422) {
      const detail = error.response?.data?.detail;
      if (Array.isArray(detail) && detail.length > 0) {
        const counts = new Map<string, number>();
        detail.forEach((d: { loc?: (string | number)[]; msg?: string }) => {
          const field = d.loc ? String(d.loc[d.loc.length - 1]) : 'field';
          const msg   = (d.msg ?? 'invalid').replace(/^Value error,\s*/i, '');
          const key   = `${field}: ${msg}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        });
        const lines = Array.from(counts.entries())
          .slice(0, 4)
          .map(([key, n]) => n > 1 ? `${key} (${n} rows)` : key);
        const extra = counts.size > 4 ? ` +${counts.size - 4} more issue(s)` : '';
        return Promise.reject(new Error(lines.join('\n') + extra));
      }
    }

    return Promise.reject(error);
  }
);

export async function apiGet<T>(url: string): Promise<T> {
  const res = await api.get<ApiResponse<T>>(url);
  if (res.data.error) throw new Error(res.data.error);
  return res.data.data as T;
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.post<ApiResponse<T>>(url, body);
  if (res.data.error) throw new Error(res.data.error);
  return res.data.data as T;
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.patch<ApiResponse<T>>(url, body);
  if (res.data.error) throw new Error(res.data.error);
  return res.data.data as T;
}

export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.put<ApiResponse<T>>(url, body);
  if (res.data.error) throw new Error(res.data.error);
  return res.data.data as T;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await api.delete<ApiResponse<T>>(url);
  if (res.data.error) throw new Error(res.data.error);
  return res.data.data as T;
}

export default api;