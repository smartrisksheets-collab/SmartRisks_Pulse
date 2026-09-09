import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { auditApi } from '../services/api'
import type { AuditLogItem } from '../types/admin'
import { formatDateLong as formatDate } from '../utils/format'

const LIMIT_OPTIONS = [50, 100, 250, 500]

const ACTION_LABELS: Record<string, string> = {
  update_workspace:      'Updated workspace',
  create_admin_account:  'Created admin account',
  update_admin_account:  'Updated admin account',
}

function ActionBadge({ action }: { action: string }) {
  const isCreate = action.startsWith('create')
  const isUpdate = action.startsWith('update')
  const bg = isCreate
    ? 'var(--primary-dim)'
    : isUpdate
    ? 'var(--warning-dim)'
    : 'rgba(100,116,139,0.15)'
  const color = isCreate
    ? 'var(--primary)'
    : isUpdate
    ? 'var(--warning)'
    : 'var(--muted)'

  return (
    <span className="a-badge" style={{ background: bg, color }}>
      {ACTION_LABELS[action] ?? action}
    </span>
  )
}

function MetaDrawer({
  item,
  onClose,
}: {
  item: AuditLogItem
  onClose: () => void
}) {
  const before = item.meta?.before as Record<string, unknown> | undefined
  const after = item.meta?.after as Record<string, unknown> | undefined
  const hasChanges = before && after && Object.keys(after).length > 0

  return (
    <>
      <div className="a-drawer-overlay" onClick={onClose} />
      <div className="a-drawer">
        <div className="a-drawer-header">
          <div>
            <div className="a-drawer-title">Audit Detail</div>
            <div className="a-drawer-sub">{formatDate(item.created_at)}</div>
          </div>
          <button className="a-drawer-close" onClick={onClose}>×</button>
        </div>

        <div className="a-drawer-body">
          <div className="a-detail-row">
            <span className="a-detail-label">Action</span>
            <ActionBadge action={item.action} />
          </div>
          <div className="a-detail-row">
            <span className="a-detail-label">Admin</span>
            <span className="a-detail-val">{item.admin_name ?? '—'}</span>
          </div>
          <div className="a-detail-row">
            <span className="a-detail-label">Target type</span>
            <span className="a-detail-val">{item.target_type}</span>
          </div>
          <div className="a-detail-row">
            <span className="a-detail-label">Target ID</span>
            <span
              className="a-detail-val"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            >
              {item.target_id}
            </span>
          </div>

          {hasChanges && (
            <>
              <hr className="a-divider" />
              <div className="a-form-label" style={{ marginBottom: 12 }}>Changes</div>
              {Object.keys(after).map((key) => (
                <div key={key} className="a-detail-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <span className="a-detail-label">{key}</span>
                  <div className="a-flex a-gap-8" style={{ flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 12,
                        color: 'var(--danger)',
                        textDecoration: 'line-through',
                      }}
                    >
                      {String(before[key] ?? '—')}
                    </span>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>→</span>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 12,
                        color: 'var(--primary)',
                      }}
                    >
                      {String(after[key] ?? '—')}
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}

          {item.meta && !hasChanges && (
            <>
              <hr className="a-divider" />
              <div className="a-form-label" style={{ marginBottom: 8 }}>Meta</div>
              <pre
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 6,
                  padding: 12,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'monospace',
                }}
              >
                {JSON.stringify(item.meta, null, 2)}
              </pre>
            </>
          )}
        </div>

        <div className="a-drawer-footer">
          <button className="a-btn a-btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  )
}

export default function AuditLog() {
  const [limit, setLimit] = useState(100)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<AuditLogItem | null>(null)

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['admin', 'audit-log', limit],
    queryFn: () => auditApi.list({ limit }),
    staleTime: 30_000,
  })

  const filtered = entries.filter((e) => {
    const q = search.toLowerCase()
    return (
      e.action.toLowerCase().includes(q) ||
      (e.admin_name ?? '').toLowerCase().includes(q) ||
      e.target_type.toLowerCase().includes(q) ||
      e.target_id.toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Audit Log</div>
          <div className="a-page-sub">All admin actions on this panel</div>
        </div>
      </div>

      <div className="a-search-bar">
        <input
          className="a-search-input"
          placeholder="Search by action, admin, or target..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="a-select"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        >
          {LIMIT_OPTIONS.map((l) => (
            <option key={l} value={l}>Last {l}</option>
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
                <th>Time</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Target</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}
                  >
                    No audit entries found.
                  </td>
                </tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatDate(e.created_at)}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {e.admin_name ?? (
                        <span className="a-text-muted">deleted admin</span>
                      )}
                    </td>
                    <td><ActionBadge action={e.action} /></td>
                    <td>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {e.target_type}
                      </div>
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 11,
                          color: 'var(--muted)',
                          marginTop: 2,
                        }}
                      >
                        {e.target_id.length > 24
                          ? `${e.target_id.slice(0, 24)}...`
                          : e.target_id}
                      </div>
                    </td>
                    <td>
                      {e.meta && (
                        <button
                          className="a-btn a-btn-ghost"
                          style={{ padding: '5px 12px', fontSize: 12 }}
                          onClick={() => setSelected(e)}
                        >
                          Detail
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <MetaDrawer
          item={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}