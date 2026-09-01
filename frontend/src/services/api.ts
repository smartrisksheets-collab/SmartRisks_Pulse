import axios from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse } from '../types/api';
import type { WorkspaceInfo } from '../types/auth';
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

// Shared refresh promise: prevents concurrent refresh calls when multiple
// requests fail with 401 at the same time.
let _refreshPromise: Promise<string | null> | null = null;

async function _attemptRefresh(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = axios
    .post<ApiResponse<{ access_token: string; workspaces?: WorkspaceInfo[] }>>(
      `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'}/api/v1/auth/refresh`,
      null,
      { withCredentials: true }
    )
    .then((res) => {
      const token = res.data?.data?.access_token ?? null;
      const list  = res.data?.data?.workspaces;
      if (token) useAuthStore.getState().setToken(token);
      if (list && list.length > 0) useAuthStore.getState().setWorkspaces(list);
      return token;
    })
    .catch(() => null)
    .finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

function _forceLogout() {
  useAuthStore.getState().logout();
  window.location.href = '/login';
}

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const status = error.response?.status;
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
    const isAuthRoute = ['/login', '/register', '/forgot-password', '/reset-password'].includes(window.location.pathname);
    const isRefreshCall = originalRequest?.url?.includes('/auth/refresh');

    if (status === 401 && !isAuthRoute) {
      // If the refresh endpoint itself returned 401, the refresh token is
      // expired or invalid. Log out immediately, no retry.
      if (isRefreshCall || originalRequest._retried) {
        _forceLogout();
        return Promise.reject(error);
      }

      // First 401 on a normal request: try to refresh the access token.
      originalRequest._retried = true;
      const newToken = await _attemptRefresh();

      if (!newToken) {
        // Refresh failed (cookie missing, expired, or server error).
        _forceLogout();
        return Promise.reject(error);
      }

      // The refresh succeeded but returned a base token with no workspace
      // (mid-onboarding, awaiting PIN, or awaiting workspace selection).
      // Retrying would 401 again and force a logout, so route the user to
      // the gate instead and let the router take over.
      const refreshed = useAuthStore.getState().claims;
      if (!refreshed?.active_tenant_id) {
        const target = refreshed?.pending_tenant_id ? '/verify-pin' : '/workspaces';
        if (window.location.pathname !== target) window.location.href = target;
        return Promise.reject(error);
      }

      // Retry the original request with the fresh token.
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
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

    const backendMessage = error.response?.data?.error ?? error.response?.data?.detail;
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