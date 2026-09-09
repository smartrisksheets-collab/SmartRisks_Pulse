import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workspacesApi, paymentsApi } from '../services/api'
import type { WorkspaceListItem, Payment } from '../types/admin'
import { formatDate } from '../utils/format'

type StatusFilter = 'ALL' | 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'SUSPENDED'

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'ACTIVE', 'TRIAL', 'EXPIRED', 'SUSPENDED']

const MODULES_OPTIONS = ['risk', 'incident']

function StatusBadge({ status }: { status: string }) {
  const cls = status.toLowerCase()
  return <span className={`a-badge ${cls}`}>{status}</span>
}


interface DrawerState {
  workspace: WorkspaceListItem
  plan: string
  payment_active: boolean
  payment_date: string
  plan_expires_at: string
  max_users: string
  max_risks: string
  modules: string[]
  industry: string
  workspace_status: string
}

function buildDrawerState(w: WorkspaceListItem): DrawerState {
  return {
    workspace: w,
    plan: w.plan,
    payment_active: w.payment_active,
    payment_date: w.payment_date ?? '',
    plan_expires_at: w.plan_expires_at ?? '',
    max_users: String(w.max_users),
    max_risks: String(w.max_risks),
    modules: [...w.modules],
    industry: w.industry ?? '',
    workspace_status: w.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
  }
}

interface EditPayForm {
  amount: string
  currency: string
  method: string
  reference: string
  notes: string
  paid_at: string
}

function PaymentRow({
  payment,
  workspaceId,
  onUpdated,
}: {
  payment: Payment
  workspaceId: string
  onUpdated: () => void
}) {
  const [email, setEmail]           = useState('')
  const [sending, setSending]       = useState(false)
  const [sent, setSent]             = useState(false)
  const [receiptErr, setReceiptErr] = useState<string | null>(null)
  const [showInput, setShowInput]   = useState(false)
  const [editing, setEditing]       = useState(false)
  const [editErr, setEditErr]       = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editForm, setEditForm]     = useState<EditPayForm>({
    amount:    String(payment.amount),
    currency:  payment.currency,
    method:    payment.method    ?? '',
    reference: payment.reference ?? '',
    notes:     payment.notes     ?? '',
    paid_at:   payment.paid_at,
  })

  async function handleSend() {
    if (!email) return
    setSending(true)
    setReceiptErr(null)
    try {
      await paymentsApi.sendReceipt(workspaceId, payment.id, email)
      setSent(true)
      setShowInput(false)
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string } } }).response?.data
      setReceiptErr(data?.error ?? 'Failed to send receipt.')
    } finally {
      setSending(false)
    }
  }

  async function handleSaveEdit() {
    setEditSaving(true)
    setEditErr(null)
    try {
      await paymentsApi.update(workspaceId, payment.id, {
        amount:    Number(editForm.amount),
        currency:  editForm.currency,
        method:    editForm.method    || undefined,
        reference: editForm.reference || undefined,
        notes:     editForm.notes     || undefined,
        paid_at:   editForm.paid_at,
      })
      onUpdated()
      setEditing(false)
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string } } }).response?.data
      setEditErr(data?.error ?? 'Failed to save changes.')
    } finally {
      setEditSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="a-pay-row">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <div className="a-form-label" style={{ marginBottom: 4 }}>Amount</div>
            <input className="a-input" type="number" step="0.01" value={editForm.amount}
              onChange={(e) => setEditForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <div className="a-form-label" style={{ marginBottom: 4 }}>Currency</div>
            <select className="a-select" style={{ width: '100%' }} value={editForm.currency}
              onChange={(e) => setEditForm(f => ({ ...f, currency: e.target.value }))}>
              {['USD','GBP','EUR','NGN','GHS','KES','ZAR'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div className="a-form-label" style={{ marginBottom: 4 }}>Payment date</div>
            <input className="a-input" type="date" value={editForm.paid_at}
              onChange={(e) => setEditForm(f => ({ ...f, paid_at: e.target.value }))} />
          </div>
          <div>
            <div className="a-form-label" style={{ marginBottom: 4 }}>Method</div>
            <input className="a-input" type="text" value={editForm.method}
              onChange={(e) => setEditForm(f => ({ ...f, method: e.target.value }))} />
          </div>
          <div>
            <div className="a-form-label" style={{ marginBottom: 4 }}>Reference</div>
            <input className="a-input" type="text" value={editForm.reference}
              onChange={(e) => setEditForm(f => ({ ...f, reference: e.target.value }))} />
          </div>
          <div>
            <div className="a-form-label" style={{ marginBottom: 4 }}>Notes</div>
            <input className="a-input" type="text" value={editForm.notes}
              onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        {editErr && <div style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 6 }}>{editErr}</div>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="a-btn a-btn-primary" style={{ padding: '5px 14px', fontSize: 12 }}
            onClick={handleSaveEdit} disabled={editSaving}>
            {editSaving ? 'Saving...' : 'Save'}
          </button>
          <button className="a-btn a-btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }}
            onClick={() => { setEditing(false); setEditErr(null) }}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="a-pay-row">
      <div className="a-pay-main">
        <span className="a-pay-amount">{payment.currency} {payment.amount.toFixed(2)}</span>
        <span className="a-pay-date">{formatDate(payment.paid_at)}</span>
      </div>
      <div className="a-pay-meta">
        {payment.method    && <span>{payment.method}</span>}
        {payment.reference && <span>Ref: {payment.reference}</span>}
        {payment.recorded_by && <span>By {payment.recorded_by}</span>}
      </div>
      {payment.notes && <div className="a-pay-notes">{payment.notes}</div>}
      {!showInput && !sent && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button className="a-btn a-btn-ghost"
            style={{ padding: '4px 10px', fontSize: 11 }}
            onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="a-btn a-btn-ghost"
            style={{ padding: '4px 10px', fontSize: 11 }}
            onClick={() => setShowInput(true)}>
            Send receipt
          </button>
        </div>
      )}
      {sent && (
        <span style={{ fontSize: 11, color: 'var(--primary)', marginTop: 6, display: 'block' }}>
          Receipt sent.
        </span>
      )}
      {showInput && !sent && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input
            className="a-input"
            type="email"
            placeholder="Recipient email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ flex: 1, padding: '5px 10px', fontSize: 12 }}
          />
          <button
            className="a-btn a-btn-primary"
            style={{ padding: '5px 12px', fontSize: 12, flexShrink: 0 }}
            onClick={handleSend}
            disabled={sending || !email}
          >
            {sending ? '...' : 'Send'}
          </button>
          <button
            className="a-btn a-btn-ghost"
            style={{ padding: '5px 10px', fontSize: 12, flexShrink: 0 }}
            onClick={() => { setShowInput(false); setReceiptErr(null) }}
          >
            Cancel
          </button>
        </div>
      )}
      {receiptErr && (
        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{receiptErr}</div>
      )}
    </div>
  )
}

function DeleteWorkspaceModal({
  workspace,
  onConfirm,
  onClose,
  loading,
  error,
}: {
  workspace: WorkspaceListItem
  onConfirm: () => void
  onClose: () => void
  loading: boolean
  error: string | null
}) {
  return (
    <div className="a-drawer-overlay" onClick={onClose} style={{ zIndex: 400 }}>
      <div
        className="a-modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'var(--card)', borderRadius: 14,
          padding: 28, maxWidth: 440, width: '90%',
          boxShadow: '0 20px 60px rgba(15,23,42,0.18)',
          zIndex: 401,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div className="a-page-title" style={{ fontSize: 15, marginBottom: 6 }}>
            Delete Trial Workspace
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
            This will permanently delete <strong>{workspace.name}</strong> and all associated
            data including risks, incidents, members, reports, and audit logs.
            This action cannot be undone.
          </p>
        </div>
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: 8, padding: '10px 14px', marginBottom: 20,
          fontSize: 12, color: '#dc2626', fontWeight: 600,
        }}>
          Only TRIAL workspaces can be deleted. Paid workspaces must be suspended.
        </div>
        {error && (
          <div className="a-error-msg" style={{ marginBottom: 12, textAlign: 'left' }}>{error}</div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="a-btn a-btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              background: '#dc2626', color: '#fff', border: 'none',
              borderRadius: 8, padding: '8px 20px', fontSize: 13,
              fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Deleting...' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface PaymentForm {
  amount: string
  currency: string
  method: string
  reference: string
  notes: string
  paid_at: string
}

const EMPTY_PAY: PaymentForm = { amount: '', currency: 'USD', method: '', reference: '', notes: '', paid_at: '' }

function WorkspaceDrawer({
  state,
  onClose,
  onSave,
  saving,
}: {
  state: DrawerState
  onClose: () => void
  onSave: (patch: Record<string, unknown>) => void
  saving: boolean
}) {
  const [form, setForm] = useState(state)
  const [tab, setTab] = useState<'settings' | 'payments'>('settings')
  const [payForm, setPayForm] = useState<PaymentForm>(EMPTY_PAY)
  const [payError, setPayError] = useState<string | null>(null)

  const qc = useQueryClient()

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ['admin', 'payments', state.workspace.id],
    queryFn: () => paymentsApi.list(state.workspace.id),
    enabled: tab === 'payments',
  })

  const recordMutation = useMutation({
    mutationFn: () =>
      paymentsApi.create(state.workspace.id, {
        amount: Number(payForm.amount),
        currency: payForm.currency,
        method: payForm.method || undefined,
        reference: payForm.reference || undefined,
        notes: payForm.notes || undefined,
        paid_at: payForm.paid_at,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'payments', state.workspace.id] })
      qc.invalidateQueries({ queryKey: ['admin', 'workspaces'] })
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] })
      setPayForm(EMPTY_PAY)
      setPayError(null)
    },
    onError: (err: unknown) => {
      if (err && typeof err === 'object' && 'response' in err) {
        const data = (err as { response?: { data?: { error?: string } } }).response?.data
        setPayError(data?.error ?? 'Failed to record payment.')
      } else {
        setPayError('Failed to record payment.')
      }
    },
  })

  function set<K extends keyof DrawerState>(key: K, value: DrawerState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleModule(mod: string) {
    set(
      'modules',
      form.modules.includes(mod)
        ? form.modules.filter((m) => m !== mod)
        : [...form.modules, mod]
    )
  }

  function handleSave() {
    const patch: Record<string, unknown> = {
      plan: form.plan,
      payment_active: form.payment_active,
      payment_date: form.payment_date || null,
      plan_expires_at: form.plan_expires_at || null,
      max_users: Number(form.max_users),
      max_risks: Number(form.max_risks),
      modules: form.modules,
      industry: form.industry || null,
      workspace_status: form.workspace_status,
    }
    onSave(patch)
  }

  const w = state.workspace

  return (
    <>
      <div className="a-drawer-overlay" onClick={onClose} />
      <div className="a-drawer">
        <div className="a-drawer-header">
          <div>
            <div className="a-drawer-title">{w.name}</div>
            <div className="a-drawer-sub">
              {w.member_count} members, {w.risk_count} risks, {w.incident_count} incidents
            </div>
          </div>
          <button className="a-drawer-close" onClick={onClose}>×</button>
        </div>

        <div className="a-drawer-tabs">
          <button
            className={`a-drawer-tab${tab === 'settings' ? ' active' : ''}`}
            onClick={() => setTab('settings')}
          >
            Settings
          </button>
          <button
            className={`a-drawer-tab${tab === 'payments' ? ' active' : ''}`}
            onClick={() => setTab('payments')}
          >
            Payments
          </button>
        </div>

        <div className="a-drawer-body">
          {tab === 'settings' && (
            <>
          <div className="a-detail-row">
            <span className="a-detail-label">Created</span>
            <span className="a-detail-val">{formatDate(w.created_at)}</span>
          </div>
          <div className="a-detail-row">
            <span className="a-detail-label">First risk logged</span>
            <span className="a-detail-val">{formatDate(w.first_risk_at)}</span>
          </div>
          <div className="a-detail-row">
            <span className="a-detail-label">Current status</span>
            <StatusBadge status={w.status} />
          </div>

          <hr className="a-divider" />

          <div className="a-form-group">
            <label className="a-form-label">Plan</label>
            <select
              className="a-select"
              style={{ width: '100%' }}
              value={form.plan}
              onChange={(e) => set('plan', e.target.value)}
            >
              <option value="TRIAL">TRIAL</option>
              <option value="PAID">PAID</option>
              <option value="EXPIRED">EXPIRED</option>
            </select>
            {form.plan === 'EXPIRED' && (
              <div style={{
                marginTop: 6, fontSize: 11, color: '#dc2626',
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 6, padding: '6px 10px', lineHeight: 1.5,
              }}>
                Setting plan to EXPIRED will immediately lock all members out of this workspace.
                Use Suspend status instead if you want a softer block.
              </div>
            )}
          </div>

          <div className="a-toggle-row">
            <span className="a-toggle-label">Payment active</span>
            <input
              type="checkbox"
              checked={form.payment_active}
              onChange={(e) => set('payment_active', e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--primary)' }}
            />
          </div>

          <div className="a-form-group">
            <label className="a-form-label">Payment date</label>
            <input
              className="a-input"
              type="date"
              value={form.payment_date}
              onChange={(e) => {
                const val = e.target.value
                set('payment_date', val)
                if (val) {
                  const d = new Date(val)
                  d.setFullYear(d.getFullYear() + 1)
                  set('plan_expires_at', d.toISOString().split('T')[0])
                }
              }}
            />
          </div>

          <div className="a-form-group">
            <label className="a-form-label">Plan expires at</label>
            <input
              className="a-input"
              type="date"
              value={form.plan_expires_at}
              onChange={(e) => set('plan_expires_at', e.target.value)}
            />
          </div>

          <div className="a-form-group">
            <label className="a-form-label">Max users</label>
            <input
              className="a-input"
              type="number"
              min={1}
              value={form.max_users}
              onChange={(e) => set('max_users', e.target.value)}
            />
          </div>

          <div className="a-form-group">
            <label className="a-form-label">Max risks</label>
            <input
              className="a-input"
              type="number"
              min={1}
              value={form.max_risks}
              onChange={(e) => set('max_risks', e.target.value)}
            />
          </div>

          <div className="a-form-group">
            <label className="a-form-label">Modules</label>
            <div className="a-flex a-gap-12" style={{ marginTop: 6 }}>
              {MODULES_OPTIONS.map((mod) => (
                <label key={mod} className="a-flex a-gap-8" style={{ cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={form.modules.includes(mod)}
                    onChange={() => toggleModule(mod)}
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  {mod}
                </label>
              ))}
            </div>
          </div>

          <div className="a-form-group">
            <label className="a-form-label">Industry</label>
            <input
              className="a-input"
              type="text"
              value={form.industry}
              onChange={(e) => set('industry', e.target.value)}
            />
          </div>

          <hr className="a-divider" />

          <div className="a-form-group">
            <label className="a-form-label">Workspace status</label>
            <select
              className="a-select"
              style={{ width: '100%' }}
              value={form.workspace_status}
              onChange={(e) => set('workspace_status', e.target.value)}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>
          </div>
            </>
          )}

          {tab === 'payments' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <div className="a-card-title" style={{ marginBottom: 12 }}>Payment History</div>
                {paymentsLoading && <div className="a-text-muted" style={{ fontSize: 13 }}>Loading...</div>}
                {!paymentsLoading && payments.length === 0 && (
                  <div className="a-text-muted" style={{ fontSize: 13 }}>No payments recorded yet.</div>
                )}
                {payments.map((p) => (
                  <PaymentRow
                    key={p.id}
                    payment={p}
                    workspaceId={state.workspace.id}
                    onUpdated={() => qc.invalidateQueries({ queryKey: ['admin', 'payments', state.workspace.id] })}
                  />
                ))}
              </div>

              <hr className="a-divider" />

              <div className="a-card-title" style={{ marginBottom: 12 }}>Record Payment</div>
              <div className="a-form-group">
                <label className="a-form-label">Amount *</label>
                <input
                  className="a-input"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={payForm.amount}
                  onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))}
                />
              </div>
              <div className="a-form-group">
                <label className="a-form-label">Currency</label>
                <select
                  className="a-select"
                  style={{ width: '100%' }}
                  value={payForm.currency}
                  onChange={(e) => setPayForm((p) => ({ ...p, currency: e.target.value }))}
                >
                  {['USD', 'GBP', 'EUR', 'NGN', 'GHS', 'KES', 'ZAR'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="a-form-group">
                <label className="a-form-label">Payment date *</label>
                <input
                  className="a-input"
                  type="date"
                  value={payForm.paid_at}
                  onChange={(e) => setPayForm((p) => ({ ...p, paid_at: e.target.value }))}
                />
              </div>
              <div className="a-form-group">
                <label className="a-form-label">Method</label>
                <input
                  className="a-input"
                  type="text"
                  placeholder="Bank transfer, Stripe, etc."
                  value={payForm.method}
                  onChange={(e) => setPayForm((p) => ({ ...p, method: e.target.value }))}
                />
              </div>
              <div className="a-form-group">
                <label className="a-form-label">Reference</label>
                <input
                  className="a-input"
                  type="text"
                  placeholder="Transaction ID or ref"
                  value={payForm.reference}
                  onChange={(e) => setPayForm((p) => ({ ...p, reference: e.target.value }))}
                />
              </div>
              <div className="a-form-group">
                <label className="a-form-label">Notes</label>
                <textarea
                  className="a-input"
                  rows={2}
                  placeholder="Optional notes"
                  value={payForm.notes}
                  onChange={(e) => setPayForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>
              {payError && <div className="a-error-msg" style={{ textAlign: 'left', marginBottom: 8 }}>{payError}</div>}
            </>
          )}
        </div>

        <div className="a-drawer-footer">
          {tab === 'settings' ? (
            <>
              <button className="a-btn a-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </button>
              <button className="a-btn a-btn-ghost" onClick={onClose}>Cancel</button>
            </>
          ) : (
            <>
              <button
                className="a-btn a-btn-primary"
                onClick={() => recordMutation.mutate()}
                disabled={recordMutation.isPending || !payForm.amount || !payForm.paid_at}
              >
                {recordMutation.isPending ? 'Recording...' : 'Record payment'}
              </button>
              <button className="a-btn a-btn-ghost" onClick={onClose}>Close</button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export default function Workspaces() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null)
  const [saveError,    setSaveError]    = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceListItem | null>(null)
  const [deleteError,  setDeleteError]  = useState<string | null>(null)

  const { data: workspaces = [], isLoading } = useQuery({
    queryKey: ['admin', 'workspaces'],
    queryFn: workspacesApi.list,
  })

  const mutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      workspacesApi.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'workspaces'] })
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] })
      setDrawerState(null)
      setSaveError(null)
    },
    onError: () => {
      setSaveError('Failed to save. Please try again.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workspacesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'workspaces'] })
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] })
      setDeleteTarget(null)
      setDeleteError(null)
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: { error?: string } } }).response?.data
      setDeleteError(data?.error ?? 'Failed to delete workspace.')
    },
  })

  const filtered = workspaces.filter((w) => {
    const matchSearch =
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      (w.industry ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (w.owner_email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (w.owner_name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'ALL' || w.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Workspaces</div>
          <div className="a-page-sub">{workspaces.length} total</div>
        </div>
      </div>

      <div className="a-search-bar">
        <input
          className="a-search-input"
          placeholder="Search by name or industry..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="a-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="a-text-muted">Loading...</div>
      ) : (
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Plan</th>
                <th>Members</th>
                <th>Risks</th>
                <th>Incidents</th>
                <th>Activated</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
                    No workspaces match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{w.name}</div>
                      {w.industry && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          {w.industry}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{w.owner_name ?? '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {w.owner_email ?? ''}
                      </div>
                    </td>
                    <td><StatusBadge status={w.status} /></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{w.plan}</td>
                    <td>{w.member_count}</td>
                    <td>{w.risk_count}</td>
                    <td>{w.incident_count}</td>
                    <td style={{ color: w.first_risk_at ? 'var(--primary)' : 'var(--danger)', fontSize: 12 }}>
                      {w.first_risk_at ? formatDate(w.first_risk_at) : 'Never'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {formatDate(w.plan_expires_at)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="a-btn a-btn-ghost"
                          style={{ padding: '5px 12px', fontSize: 12 }}
                          onClick={() => setDrawerState(buildDrawerState(w))}
                        >
                          Edit
                        </button>
                        {w.plan === 'TRIAL' && (
                          <button
                            className="a-btn"
                            style={{
                              padding: '5px 12px', fontSize: 12,
                              color: 'var(--danger)', border: '1px solid var(--danger)',
                              background: 'none', borderRadius: 8,
                            }}
                            onClick={() => { setDeleteTarget(w); setDeleteError(null) }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {saveError && (
        <div className="a-error-msg" style={{ marginTop: 12 }}>{saveError}</div>
      )}

      {deleteTarget && (
        <DeleteWorkspaceModal
          workspace={deleteTarget}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onClose={() => { setDeleteTarget(null); setDeleteError(null) }}
          loading={deleteMutation.isPending}
          error={deleteError}
        />
      )}

      {drawerState && (
        <WorkspaceDrawer
          state={drawerState}
          onClose={() => { setDrawerState(null); setSaveError(null) }}
          onSave={(patch) => mutation.mutate({ id: drawerState.workspace.id, patch })}
          saving={mutation.isPending}
        />
      )}
    </div>
  )
}