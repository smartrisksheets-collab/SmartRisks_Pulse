import type { ModuleKey, PlanStage, UserRole, Permissions } from './api';

export type { Permissions };

export interface WorkspaceInfo {
  tenant_id: string;
  name: string;
  role: UserRole;
  plan: PlanStage;
  modules: ModuleKey[];
}

export interface AuthClaims {
  sub: string;
  email: string;
  active_tenant_id: string | null;
  pending_tenant_id?: string;
  role: UserRole;
  permissions: Permissions;
  plan: PlanStage;
  trial_expires_at: string | null;
  modules: ModuleKey[];
  workspaces: WorkspaceInfo[];
}

export interface LoginResult {
  access_token: string;
  requires_workspace_select: boolean;
  requires_pin: boolean;
  workspaces: WorkspaceInfo[];
}