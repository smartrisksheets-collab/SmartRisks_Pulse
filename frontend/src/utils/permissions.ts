import type { Permissions } from '../types/auth';
import { useAuthStore } from '../store/authStore';

export function canDo(permission: keyof Permissions): boolean {
  return useAuthStore.getState().claims?.permissions?.[permission] === true;
}

export function useCanDo(permission: keyof Permissions): boolean {
  return useAuthStore((s) => s.claims?.permissions?.[permission] === true);
}