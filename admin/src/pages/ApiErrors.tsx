import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { errorsApi } from '../services/api'
import type { ErrorLogItem } from '../types/admin'

type CodeFilter = 'ALL' | '4xx' | '5xx'

const CODE_FILTERS: CodeFilter[] = ['ALL', '4xx', '5xx']

const LIMIT_OPTIONS = [50, 100, 250, 500]

function formatDate(d: string): string {
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function StatusCodeBadge({ code }: { code: number }) {
  const is5xx = code >= 500
  const style = {
    background: is5xx ? 'var(--danger-dim)' : 'var(--warning-dim)',
    color: is5xx ? 'var(--danger)' : 'var(--warning)',
  }
  return (
    <span className="a-badge" style={style}>
      {code}
    </span>
  )
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      style={{
        fontFamily: 'monospace',
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--primary)',
        background: 'var(--primary-dim)',
        padding: '2px 6px',
        borderRadius: 4,
      }}
    >
      {method}
    </span>
  )
}

function ErrorDetailDrawer({
  item,
  onClose,
}: {
  item: ErrorLogItem
  onClose: () => void
}) {
  return (
    <>
      <div className="a-drawer-overlay" onClick={onClose} />
      <div className="a-drawer">
        <div className="a-drawer-header">
          <div>
            <div className="a-drawer-title">Error Detail</div>
            <div className="a-drawer-sub">{formatDate(item.created_at)}</div>
          </div>
          <button className="a-drawer-close" onClick={onClose}>×</button>
        </div>

        <div className="a-drawer-body">
          <div className="a-detail-row">
            <span className="a-detail-label">Status</span>
            <StatusCodeBadge code={item.status_code} />
          </div>
          <div className="a-detail-row">
            <span className="a-detail-label">Method</span>
            <MethodBadge method={item.method} />
          </div>
          <div className="a-detail-row">
            <span className="a-detail-label">Path</span>
            <span
              className="a-detail-val"
              style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}
            >
              {item.path}
            </span>
          </div>
          <div className="a-detail-row">
            <span className="a-detail-label">Duration</span>
            <span className="a-detail-val">
              {item.duration_ms != null ? `${item.duration_ms}ms` : '—'}
            </span>
          </div>
          <div className="a-detail-row">
            <span className="a-detail-label">Tenant</span>
            <span className="a-detail-val" style={{ fontFamily: 'monospace', fontSize: 12 }}>
              {item.tenant_id ?? '—'}
            </span>
          </div>

          {item.error_detail && (
            <>
              <hr className="a-divider" />
              <div className="a-form-label" style={{ marginBottom: 8 }}>Error detail</div>
              <pre
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 6,
                  padding: 12,
                  fontSize: 12,
                  color: 'var(--danger)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'monospace',
                }}
              >
                {item.error_detail}
              </pre>
            </>
          )}

          {item.request_body && Object.keys(item.request_body).length > 0 && (
            <>
              <hr className="a-divider" />
              <div className="a-form-label" style={{ marginBottom: 8 }}>Request body (scrubbed)</div>
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
                {JSON.stringify(item.request_body, null, 2)}
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

export default function ApiErrors() {
  const [codeFilter, setCodeFilter] = useState<CodeFilter>('ALL')
  const [limit, setLimit] = useState(100)
  const [selected, setSelected] = useState<ErrorLogItem | null>(null)
  const [search, setSearch] = useState('')

  const statusCodeParam =
    codeFilter === '5xx' ? 500 :
    codeFilter === '4xx' ? 400 :
    undefined

  const { data: errors = [], isLoading } = useQuery({
    queryKey: ['admin', 'errors', codeFilter, limit],
    queryFn: () => errorsApi.list({ status_code: statusCodeParam, limit }),
    refetchInterval: 30_000,
  })

  const { data: summary } = useQuery({
    queryKey: ['admin', 'error-summary'],
    queryFn: errorsApi.summary,
    refetchInterval: 30_000,
  })

  const hourlyData = (summary?.errors_by_hour ?? []).map((r) => ({
    hour: new Date(r.hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    count: r.count,
  }))

  const filtered = errors.filter((e) => {
    const q = search.toLowerCase()
    return (
      e.path.toLowerCase().includes(q) ||
      (e.tenant_id ?? '').toLowerCase().includes(q) ||
      String(e.status_code).includes(q)
    )
  })

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">API Errors</div>
          <div className="a-page-sub">Refreshes every 30 seconds</div>
        </div>
      </div>

      {summary && (
        <>
          <div className="a-stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', maxWidth: 420, marginBottom: 20 }}>
            <div className="a-stat-card">
              <div className="a-stat-label">Total</div>
              <div className="a-stat-value">{summary.total_errors}</div>
            </div>
            <div className="a-stat-card">
              <div className="a-stat-label">5xx</div>
              <div className={`a-stat-value${summary.errors_5xx > 0 ? ' danger' : ''}`}>
                {summary.errors_5xx}
              </div>
            </div>
            <div className="a-stat-card">
              <div className="a-stat-label">4xx</div>
              <div className={`a-stat-value${summary.errors_4xx > 0 ? ' warning' : ''}`}>
                {summary.errors_4xx}
              </div>
            </div>
          </div>

          {hourlyData.length > 0 && (
            <div className="a-card" style={{ marginBottom: 20 }}>
              <div className="a-card-title">Errors by Hour (last 24h)</div>
              <div style={{ height: 160, marginTop: 12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData} barSize={12}>
                    <XAxis
                      dataKey="hour"
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--card)',
                        border: '1px solid var(--line)',
                        borderRadius: 6,
                        fontSize: 12,
                        color: 'var(--text)',
                      }}
                      cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {hourlyData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.count > 10 ? 'var(--danger)' : 'var(--primary)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      <div className="a-search-bar">
        <input
          className="a-search-input"
          placeholder="Search by path, tenant, or status code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="a-select"
          value={codeFilter}
          onChange={(e) => setCodeFilter(e.target.value as CodeFilter)}
        >
          {CODE_FILTERS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
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
                <th>Code</th>
                <th>Method</th>
                <th>Path</th>
                <th>Duration</th>
                <th>Tenant</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}
                  >
                    No errors found.
                  </td>
                </tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatDate(e.created_at)}
                    </td>
                    <td><StatusCodeBadge code={e.status_code} /></td>
                    <td><MethodBadge method={e.method} /></td>
                    <td
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        maxWidth: 260,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {e.path}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {e.duration_ms != null ? `${e.duration_ms}ms` : '—'}
                    </td>
                    <td
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: 'var(--muted)',
                        maxWidth: 120,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {e.tenant_id ?? '—'}
                    </td>
                    <td>
                      <button
                        className="a-btn a-btn-ghost"
                        style={{ padding: '5px 12px', fontSize: 12 }}
                        onClick={() => setSelected(e)}
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <ErrorDetailDrawer
          item={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}