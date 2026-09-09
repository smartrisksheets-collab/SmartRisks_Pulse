export interface AdminAccount {
  id: string
  email: string
  name: string
  role: 'super_admin' | 'admin'
  status: string
  last_login: string | null
  created_at: string
}

export interface AdminTokenResponse {
  access_token: string
  token_type: string
  admin: {
    id: string
    email: string
    name: string
    role: string
  }
}

export interface OverviewStats {
  total_workspaces: number
  active_paid: number
  on_trial: number
  expired: number
  suspended: number
  new_this_week: number
  trials_expiring_7d: number
  trial_conversion_rate: number
  activation_rate: number
}

export interface WorkspaceListItem {
  id: string
  name: string
  industry: string | null
  plan: string
  status: string
  payment_active: boolean
  payment_date: string | null
  plan_expires_at: string | null
  modules: string[]
  max_users: number
  max_risks: number
  member_count: number
  risk_count: number
  incident_count: number
  first_risk_at: string | null
  created_at: string
  owner_email: string | null
  owner_name: string | null
}

export interface PlatformUser {
  id: string
  email: string
  name: string
  last_login: string | null
  last_seen: string | null
  workspace_count: number
  max_workspaces: number
  created_at: string
  is_ghost: boolean
}

export interface ErrorLogItem {
  id: string
  tenant_id: string | null
  method: string
  path: string
  status_code: number
  error_detail: string | null
  request_body: Record<string, unknown> | null
  duration_ms: number | null
  created_at: string
}

export interface ErrorSummary {
  total_errors: number
  errors_5xx: number
  errors_4xx: number
  top_paths: { path: string; count: number }[]
  errors_by_hour: { hour: string; count: number }[]
}

export interface AuditLogItem {
  id: string
  admin_id: string | null
  admin_name: string | null
  action: string
  target_type: string
  target_id: string
  meta: Record<string, unknown> | null
  created_at: string
}

export interface Payment {
  id: string
  tenant_id: string
  amount: number
  currency: string
  method: string | null
  reference: string | null
  notes: string | null
  paid_at: string
  recorded_by: string | null
  created_at: string
}