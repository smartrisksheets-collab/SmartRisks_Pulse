import axios from 'axios'
import { useAdminAuthStore } from '../store/adminAuthStore'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const adminApi = axios.create({
  baseURL: BASE_URL,
})

adminApi.interceptors.request.use((config) => {
  const token = useAdminAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

adminApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAdminAuthStore.getState().clear()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

function unwrap<T>(res: { data: { data: T } }): T {
  return res.data.data
}

export const adminAuthApi = {
  login: (email: string, password: string) =>
    adminApi.post('/api/admin/auth/login', { email, password }).then(unwrap<import('../types/admin').AdminTokenResponse>),
  me: () =>
    adminApi.get('/api/admin/auth/me').then(unwrap<import('../types/admin').AdminAccount>),
}

export const overviewApi = {
  stats: () =>
    adminApi.get('/api/admin/overview/stats').then(unwrap<import('../types/admin').OverviewStats>),
}

export const workspacesApi = {
  list: () =>
    adminApi.get('/api/admin/workspaces').then(unwrap<import('../types/admin').WorkspaceListItem[]>),
  update: (id: string, data: Record<string, unknown>) =>
    adminApi.patch(`/api/admin/workspaces/${id}`, data).then(unwrap<{ message: string }>),
}

export const usersApi = {
  list: () =>
    adminApi.get('/api/admin/platform-users').then(unwrap<import('../types/admin').PlatformUser[]>),
}

export const errorsApi = {
  list: (params?: { status_code?: number; limit?: number }) =>
    adminApi.get('/api/admin/errors', { params }).then(unwrap<import('../types/admin').ErrorLogItem[]>),
  summary: () =>
    adminApi.get('/api/admin/errors/summary').then(unwrap<import('../types/admin').ErrorSummary>),
}

export const adminAccountsApi = {
  list: () =>
    adminApi.get('/api/admin/admin-accounts').then(unwrap<import('../types/admin').AdminAccount[]>),
  create: (data: { email: string; name: string; password: string; role: string }) =>
    adminApi.post('/api/admin/admin-accounts', data).then(unwrap<import('../types/admin').AdminAccount>),
  update: (id: string, data: { name?: string; role?: string; status?: string }) =>
    adminApi.patch(`/api/admin/admin-accounts/${id}`, data).then(unwrap<import('../types/admin').AdminAccount>),
}

export const paymentsApi = {
  list: (workspaceId: string) =>
    adminApi.get(`/api/admin/workspaces/${workspaceId}/payments`).then(unwrap<import('../types/admin').Payment[]>),
  create: (workspaceId: string, data: {
    amount: number
    currency: string
    method?: string
    reference?: string
    notes?: string
    paid_at: string
  }) =>
    adminApi.post(`/api/admin/workspaces/${workspaceId}/payments`, data).then(unwrap<import('../types/admin').Payment>),
  update: (workspaceId: string, paymentId: string, data: {
    amount?: number
    currency?: string
    method?: string
    reference?: string
    notes?: string
    paid_at?: string
  }) =>
    adminApi.patch(`/api/admin/workspaces/${workspaceId}/payments/${paymentId}`, data).then(unwrap<import('../types/admin').Payment>),
  sendReceipt: (workspaceId: string, paymentId: string, email: string) =>
    adminApi.post(`/api/admin/workspaces/${workspaceId}/payments/${paymentId}/send-receipt`, { email }).then(unwrap<{ sent: boolean; to: string }>),
}

export const auditApi = {
  list: (params?: { limit?: number }) =>
    adminApi.get('/api/admin/audit-log', { params }).then(unwrap<import('../types/admin').AuditLogItem[]>),
}