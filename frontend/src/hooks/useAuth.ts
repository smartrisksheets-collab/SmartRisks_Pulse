import { useAuthStore } from '../store/authStore';
import { apiPost } from '../services/api';
import { clearCachedBrandColors } from '../utils/brand';

export function useAuth() {
  const { token, claims, logout: clearStore } = useAuthStore();

  const isAuthenticated = !!token && !!claims;
  const hasWorkspace = !!claims?.active_tenant_id;

  async function logout() {
    try {
      await apiPost('/api/v1/auth/logout');
    } catch {
      // proceed regardless
    } finally {
      clearStore();
      clearCachedBrandColors();
      window.location.href = '/login';
    }
  }

  return { token, claims, isAuthenticated, hasWorkspace, logout };
}