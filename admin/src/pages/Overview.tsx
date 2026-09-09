import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { overviewApi, errorsApi } from '../services/api'

function StatCard({
  label,
  value,
  variant = 'default',
}: {
  label: string
  value: string | number
  variant?: 'default' | 'teal' | 'danger' | 'warning'
}) {
  return (
    <div className="a-stat-card">
      <div className="a-stat-label">{label}</div>
      <div className={`a-stat-value${variant !== 'default' ? ` ${variant}` : ''}`}>
        {value}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
      {children}
    </div>
  )
}

export default function Overview() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: overviewApi.stats,
    refetchInterval: 60_000,
  })

  const { data: errorSummary } = useQuery({
    queryKey: ['admin', 'error-summary'],
    queryFn: errorsApi.summary,
    refetchInterval: 60_000,
  })

  if (statsLoading || !stats) {
    return <div className="a-text-muted" style={{ padding: 24 }}>Loading...</div>
  }

  const hourlyData = (errorSummary?.errors_by_hour ?? []).map((r) => ({
    hour: new Date(r.hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    count: r.count,
  }))

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Platform Overview</div>
          <div className="a-page-sub">Live snapshot of SmartRisk Pulse</div>
        </div>
      </div>

      <SectionTitle>Workspaces</SectionTitle>
      <div className="a-stat-grid">
        <StatCard label="Total" value={stats.total_workspaces} />
        <StatCard label="Active Paid" value={stats.active_paid} variant="teal" />
        <StatCard label="On Trial" value={stats.on_trial} variant="warning" />
        <StatCard label="Expired" value={stats.expired} variant="danger" />
        <StatCard label="Suspended" value={stats.suspended} />
        <StatCard label="New This Week" value={stats.new_this_week} variant="teal" />
        <StatCard label="Trials Expiring (7d)" value={stats.trials_expiring_7d} variant="warning" />
      </div>

      <SectionTitle>Conversion & Activation</SectionTitle>
      <div className="a-stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', maxWidth: 360 }}>
        <StatCard
          label="Trial Conversion"
          value={`${stats.trial_conversion_rate}%`}
          variant="teal"
        />
        <StatCard
          label="Activation Rate"
          value={`${stats.activation_rate}%`}
          variant={stats.activation_rate < 30 ? 'danger' : 'teal'}
        />
      </div>

      {errorSummary && (
        <>
          <SectionTitle>API Errors (last 24h)</SectionTitle>
          <div className="a-stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', maxWidth: 480, marginBottom: 16 }}>
            <StatCard label="Total Errors" value={errorSummary.total_errors} />
            <StatCard label="5xx" value={errorSummary.errors_5xx} variant={errorSummary.errors_5xx > 0 ? 'danger' : 'default'} />
            <StatCard label="4xx" value={errorSummary.errors_4xx} variant={errorSummary.errors_4xx > 0 ? 'warning' : 'default'} />
          </div>

          {hourlyData.length > 0 && (
            <div className="a-card" style={{ marginBottom: 24 }}>
              <div className="a-card-title">Errors by Hour</div>
              <div style={{ height: 180, marginTop: 12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData} barSize={14}>
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

          {errorSummary.top_paths.length > 0 && (
            <div className="a-card">
              <div className="a-card-title">Top Error Paths</div>
              <div className="a-mt-8">
                {errorSummary.top_paths.map((p) => (
                  <div
                    key={p.path}
                    className="a-flex-between"
                    style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}
                  >
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {p.path}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: p.count > 10 ? 'var(--danger)' : 'var(--text)' }}>
                      {p.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}