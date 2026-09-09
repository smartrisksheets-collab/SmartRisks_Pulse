import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthClaims, WorkspaceInfo } from '../types/auth';

function parseToken(token: string): AuthClaims | null {
  try {
    return JSON.parse(atob(token.split('.')[1])) as AuthClaims;
  } catch {
    return null;
  }
}

interface AuthState {
  token: string | null;
  claims: AuthClaims | null;
  workspaces: WorkspaceInfo[];
  setToken: (token: string) => void;
  setWorkspaces: (workspaces: WorkspaceInfo[]) => void;
  workspaceQuota: { owned: number; limit: number } | null;
  setWorkspaceQuota: (quota: { owned: number; limit: number }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      claims: null,
      workspaces: [],
      workspaceQuota: null,
      setToken: (token) => set({ token, claims: parseToken(token) }),
      setWorkspaces: (workspaces) => set({ workspaces }),
      setWorkspaceQuota: (workspaceQuota) => set({ workspaceQuota }),
      logout: () => set({ token: null, claims: null, workspaces: [] }),
    }),
    {
      name: 'sr-auth',
      partialize: (s) => ({ token: s.token, claims: s.claims, workspaces: s.workspaces }),
    }
  )
);