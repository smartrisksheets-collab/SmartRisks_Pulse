import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminAccountsApi } from '../services/api'
import { useAdminAuthStore } from '../store/adminAuthStore'
import type { AdminAccount } from '../types/admin'
import { formatDate } from '../utils/format'

type DrawerMode = 'create' | 'edit'

interface FormState {
  email: string
  name: string
  password: string
  role: string
  status: string
}

const EMPTY_FORM: FormState = {
  email: '',
  name: '',
  password: '',
  role: 'admin',
  status: 'ACTIVE',
}

function extractApiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string; detail?: unknown } } }).response?.data
    if (typeof data?.error === 'string') return data.error
    if (Array.isArray(data?.detail)) {
      return (data.detail as { msg: string }[]).map(d => d.msg).join(', ')
    }
    if (typeof data?.detail === 'string') return data.detail
  }
  return fallback
}

function buildEditForm(a: AdminAccount): FormState {
  return {
    email: a.email,
    name: a.name,
    password: '',
    role: a.role,
    status: a.status,
  }
}


function RoleBadge({ role }: { role: string }) {
  const isSuperAdmin = role === 'super_admin'
  return (
    <span
      className="a-badge"
      style={{
        background: isSuperAdmin ? 'var(--primary-dim)' : 'rgba(100,116,139,0.15)',
        color: isSuperAdmin ? 'var(--primary)' : 'var(--muted)',
      }}
    >
      {isSuperAdmin ? 'Super Admin' : 'Admin'}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  const active = status === 'ACTIVE'
  return (
    <span className="a-flex a-gap-8" style={{ fontSize: 13 }}>
      <span
        style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: active ? 'var(--primary)' : 'var(--muted)',
          display: 'inline-block',
        }}
      />
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

function AccountDrawer({
  mode,
  form,
  onChange,
  onSave,
  onClose,
  saving,
  error,
  isSelf,
}: {
  mode: DrawerMode
  form: FormState
  onChange: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  onSave: () => void
  onClose: () => void
  saving: boolean
  error: string | null
  isSelf: boolean
}) {
  return (
    <>
      <div className="a-drawer-overlay" onClick={onClose} />
      <div className="a-drawer">
        <div className="a-drawer-header">
          <div>
            <div className="a-drawer-title">
              {mode === 'create' ? 'New Admin Account' : 'Edit Admin Account'}
            </div>
            <div className="a-drawer-sub">
              {mode === 'create'
                ? 'Account will be created as active immediately.'
                : 'Changes take effect on next login.'}
            </div>
          </div>
          <button className="a-drawer-close" onClick={onClose}>×</button>
        </div>

        <div className="a-drawer-body">
          {mode === 'create' && (
            <div className="a-form-group">
              <label className="a-form-label">Email</label>
              <input
                className="a-input"
                type="email"
                value={form.email}
                onChange={(e) => onChange('email', e.target.value)}
                autoComplete="off"
              />
            </div>
          )}

          <div className="a-form-group">
            <label className="a-form-label">Name</label>
            <input
              className="a-input"
              type="text"
              value={form.name}
              onChange={(e) => onChange('name', e.target.value)}
            />
          </div>

          {mode === 'create' && (
            <div className="a-form-group">
              <label className="a-form-label">Password</label>
              <input
                className="a-input"
                type="password"
                value={form.password}
                onChange={(e) => onChange('password', e.target.value)}
                autoComplete="new-password"
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Min 12 characters, must include uppercase, lowercase, number, and symbol.
              </div>
            </div>
          )}

          <div className="a-form-group">
            <label className="a-form-label">Role</label>
            <select
              className="a-select"
              style={{ width: '100%' }}
              value={form.role}
              onChange={(e) => onChange('role', e.target.value)}
              disabled={isSelf}
            >
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
            </select>
            {isSelf && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                You cannot change your own role.
              </div>
            )}
          </div>

          {mode === 'edit' && (
            <div className="a-form-group">
              <label className="a-form-label">Status</label>
              <select
                className="a-select"
                style={{ width: '100%' }}
                value={form.status}
                onChange={(e) => onChange('status', e.target.value)}
                disabled={isSelf}
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
              {isSelf && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  You cannot deactivate your own account.
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="a-error-msg" style={{ textAlign: 'left', marginTop: 8 }}>
              {error}
            </div>
          )}
        </div>

        <div className="a-drawer-footer">
          <button
            className="a-btn a-btn-primary"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : mode === 'create' ? 'Create account' : 'Save changes'}
          </button>
          <button className="a-btn a-btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

export default function AdminAccounts() {
  const qc = useQueryClient()
  const { admin: currentAdmin } = useAdminAuthStore()

  const [drawerMode, setDrawerMode] = useState<DrawerMode | null>(null)
  const [editTarget, setEditTarget] = useState<AdminAccount | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['admin', 'admin-accounts'],
    queryFn: adminAccountsApi.list,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      adminAccountsApi.create({
        email: form.email,
        name: form.name,
        password: form.password,
        role: form.role,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'admin-accounts'] })
      closeDrawer()
    },
    onError: (err: unknown) => {
      setMutationError(extractApiError(err, 'Failed to create account.'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      adminAccountsApi.update(editTarget!.id, {
        name: form.name,
        role: form.role,
        status: form.status,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'admin-accounts'] })
      closeDrawer()
    },
    onError: (err: unknown) => {
      setMutationError(extractApiError(err, 'Failed to update account.'))
    },
  })

  function openCreate() {
    setForm(EMPTY_FORM)
    setEditTarget(null)
    setMutationError(null)
    setDrawerMode('create')
  }

  function openEdit(account: AdminAccount) {
    setForm(buildEditForm(account))
    setEditTarget(account)
    setMutationError(null)
    setDrawerMode('edit')
  }

  function closeDrawer() {
    setDrawerMode(null)
    setEditTarget(null)
    setMutationError(null)
  }

  function handleChange<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setMutationError(null)
  }

  function handleSave() {
    if (drawerMode === 'create') createMutation.mutate()
    else updateMutation.mutate()
  }

  const saving = createMutation.isPending || updateMutation.isPending

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Admin Accounts</div>
          <div className="a-page-sub">{accounts.length} admin{accounts.length !== 1 ? 's' : ''} on this panel</div>
        </div>
        <button className="a-btn a-btn-primary" onClick={openCreate}>
          Add admin
        </button>
      </div>

      {isLoading ? (
        <div className="a-text-muted">Loading...</div>
      ) : (
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th>Admin</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {a.name}
                      {a.id === currentAdmin?.id && (
                        <span
                          className="a-badge"
                          style={{
                            background: 'var(--primary-dim)',
                            color: 'var(--primary)',
                            marginLeft: 8,
                            fontSize: 10,
                          }}
                        >
                          you
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {a.email}
                    </div>
                  </td>
                  <td><RoleBadge role={a.role} /></td>
                  <td><StatusDot status={a.status} /></td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {formatDate(a.last_login)}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {formatDate(a.created_at)}
                  </td>
                  <td>
                    <button
                      className="a-btn a-btn-ghost"
                      style={{ padding: '5px 12px', fontSize: 12 }}
                      onClick={() => openEdit(a)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drawerMode && (
        <AccountDrawer
          mode={drawerMode}
          form={form}
          onChange={handleChange}
          onSave={handleSave}
          onClose={closeDrawer}
          saving={saving}
          error={mutationError}
          isSelf={editTarget?.id === currentAdmin?.id}
        />
      )}
    </div>
  )
}