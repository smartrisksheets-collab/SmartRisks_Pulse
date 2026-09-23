// src/pages/Incidents.tsx

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link2, RefreshCw, Printer } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useFeedbackStore } from '../store/feedbackStore';
import { useIncidents } from '../hooks/useIncidents';
import type { ListIncidentsParams } from '../services/incidents';
import { useAuth } from '../hooks/useAuth';
import { useLookups } from '../hooks/useLookups';
import IncidentStatCards from '../components/incidents/IncidentStatCards';
import IncidentTable from '../components/incidents/IncidentTable';
import IncidentDetailDrawer from '../components/incidents/IncidentDetailDrawer';
import IncidentPrintModal from '../components/incidents/IncidentPrintModal';
import IncidentExternalLinkModal from '../components/incidents/IncidentExternalLinkModal';
import AddIncidentModal from '../components/incidents/AddIncidentModal';
import type { Incident, IncidentCreate, IncidentStats, IncidentPageInsight, MonthlyTrend, TopDriver } from '../types/incident';
import { getIncidentPageInsights } from '../services/incidents';
import { useCanDo } from '../utils/permissions';
import { useIncidentSeverity } from '../hooks/useIncidentSeverity';

const PAGE_SIZE = 10;

const STATUSES   = ['New', 'Open', 'In Progress', 'Under Review', 'Resolved', 'Closed'];
const CHANNELS   = ['Email', 'Phone', 'Walk-in', 'Monitoring', 'Other'];

// ── Severity color helper ──────────────────────────────────────────────────────
function incSevColor(sev: string | null): string {
  const s = (sev ?? '').toLowerCase();
  if (s === 'very high') return '#dc2626';
  if (s === 'high')      return '#d97706';
  if (s === 'medium')    return '#059669';
  return '#64748b';
}

// ── AI Insights card ──────────────────────────────────────────────────────────
function IncidentInsightSection({ stats }: { stats: IncidentStats }) {
  const [insight, setInsight]   = useState<IncidentPageInsight | null>(null);
  const [loading, setLoading]   = useState(false);
  const [err,     setErr]       = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setErr(null);
    try {
      setInsight(await getIncidentPageInsights());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to generate insights.');
    } finally {
      setLoading(false);
    }
  }

  const breachCount  = stats.totals.count - stats.health.within_sla;
  const breachPct    = stats.totals.count > 0 ? Math.round((breachCount / stats.totals.count) * 100) : 0;

  return (
    <div className="inc-insight-card">
      <div className="inc-insight-head">
        <span className="inc-insight-title">AI Insights — Recommended Actions</span>
        <span className="inc-exec-tag">Executive summary</span>
      </div>
      <div className="inc-insight-stats">
        <div className="inc-insight-stat">
          <div className="inc-insight-stat-n">{stats.health.score}</div>
          <div className="inc-insight-stat-l">Health Index ({stats.health.label})</div>
        </div>
        <div className="inc-insight-stat">
          <div className="inc-insight-stat-n">{breachPct}%</div>
          <div className="inc-insight-stat-l">SLA breach rate · {breachCount} of {stats.totals.count}</div>
        </div>
        <div className="inc-insight-stat">
          <div className="inc-insight-stat-n">{stats.totals.open_over_150d}</div>
          <div className="inc-insight-stat-l">Open &gt;150 days</div>
        </div>
      </div>
      {insight ? (
        <ul className="inc-action-list">
          {insight.actions.map((a, i) => (
            <li key={i} className="inc-action-item">
              <span className="inc-action-badge">{a.badge}</span>
              <span dangerouslySetInnerHTML={{ __html: a.text }} />
            </li>
          ))}
        </ul>
      ) : (
        <>
          {err && <p style={{ color: '#fca5a5', fontSize: 12, marginBottom: 8 }}>{err}</p>}
          <button className="inc-insight-gen-btn" onClick={generate} disabled={loading} type="button">
            {loading
              ? <><span className="spinner" />Generating…</>
              : <>✦ Generate AI Insights</>
            }
          </button>
        </>
      )}
    </div>
  );
}

// ── Incident Trend panel ───────────────────────────────────────────────────────
function IncidentTrendPanel({ trend }: { trend: MonthlyTrend[] }) {
  return (
    <div className="inc-panel">
      <div className="inc-panel-title">Incident Trend</div>
      <div className="inc-panel-sub">6-month rolling count</div>
      {trend.some(t => t.count > 0) ? (
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
            <Bar dataKey="count" name="Incidents" fill="#01b88e" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="dash-empty" style={{ padding: '30px 0', textAlign: 'center', fontSize: 13 }}>No incidents logged in the last 6 months.</div>
      )}
    </div>
  );
}

// ── Top Incident Drivers panel ─────────────────────────────────────────────────
function IncidentDriversPanel({ drivers }: { drivers: TopDriver[] }) {
  return (
    <div className="inc-panel">
      <div className="inc-panel-title">Top Incident Drivers</div>
      <div className="inc-panel-sub">Open incidents ranked by age and recurrence</div>
      {drivers.length > 0 ? (
        <table className="inc-driver-table">
          <thead>
            <tr><th>Incident</th><th>Severity</th><th>Age</th></tr>
          </thead>
          <tbody>
            {drivers.slice(0, 3).map(d => (
              <tr key={d.id}>
                <td title={d.title ?? d.id}>
                  {d.title ? (d.title.length > 45 ? `${d.title.slice(0, 45)}…` : d.title) : d.id}
                </td>
                <td>
                  <span style={{ color: incSevColor(d.severity), fontWeight: 700, fontSize: 12 }}>
                    {d.severity || '—'}
                  </span>
                </td>
                <td style={{ whiteSpace: 'nowrap', fontWeight: 700, color: d.age_days > 90 ? '#dc2626' : 'var(--text)' }}>
                  {d.age_days}d
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="dash-empty" style={{ padding: '30px 0', textAlign: 'center', fontSize: 13 }}>No open incidents.</div>
      )}
    </div>
  );
}

export default function Incidents() {
  const { claims } = useAuth();
  const canManageInc = useCanDo('manage_incidents');
  const canPrint     = useCanDo('print_reports');
  const qc           = useQueryClient();
  const { lookups } = useLookups();
  const { config: sevConfig } = useIncidentSeverity();
  const severityLabels: string[] = (sevConfig.data?.levels ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(l => l.label);

  // Pagination + filters
  const [page, setPage]                     = useState(1);
  const [filterId, setFilterId]             = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterBusinessUnit, setFilterBU]   = useState('');
  const [filterSearch, setFilterSearch]     = useState('');

  // UI state
  const [flashId, setFlashId]         = useState<string | null>(null);
  const [detailInc, setDetailInc]     = useState<Incident | null>(null);
  const [showAdd, setShowAdd]         = useState(false);
  const [showPrint, setShowPrint]     = useState(false);
  const [showExtLink, setShowExtLink] = useState(false);

  // Incident list query — declared after all state is initialised
  const incidentParams: ListIncidentsParams = {
    page,
    page_size:     PAGE_SIZE,
    incident_id:   filterId           || undefined,
    category:      filterCategory     || undefined,
    severity:      filterSeverity     || undefined,
    status:        filterStatus       || undefined,
    business_unit: filterBusinessUnit || undefined,
    search:        filterSearch       || undefined,
  };
  const { incidents, total, loading, error, stats, statsLoading, create } = useIncidents(incidentParams);


  const members = (lookups?.risk_owner ?? []).map(o => ({ name: o, email: o }));
  const incidentCategories = lookups?.incident_category ?? ['Cybersecurity', 'IT Operations', 'Physical Security', 'Data Protection', 'Compliance', 'Other'];
  const businessUnits = lookups?.business_unit ?? [];

  const loadPage = useCallback((p: number) => {
    setPage(p);
  }, []);

  function applyFilters() { setPage(1); }
  function clearFilters() {
    setFilterId(''); setFilterCategory(''); setFilterSeverity('');
    setFilterStatus(''); setFilterBU(''); setFilterSearch('');
    setPage(1);
  }

  async function handleAdd(payload: IncidentCreate): Promise<void> {
    const inc = await create(payload);
    if (inc) {
      useFeedbackStore.getState().trigger('log_incident', 'How was logging your first incident?');
      setShowAdd(false);
      setFlashId(inc.id);
      setTimeout(() => setFlashId(null), 3500);
    }
  }

  function handleSaved(updated: Incident) {
    setDetailInc(null);
    setFlashId(updated.id);
    setTimeout(() => setFlashId(null), 3500);
    qc.invalidateQueries({ queryKey: ['incidents'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  }

  function handleDeleted() {
    setDetailInc(null);
    qc.invalidateQueries({ queryKey: ['incidents'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  }

  return (
    <>
      <IncidentStatCards stats={stats} loading={statsLoading} />

      {stats && <IncidentInsightSection stats={stats} />}

      {stats && (
        <div className="inc-panel-row">
          <IncidentTrendPanel trend={stats.monthly_trend} />
          <IncidentDriversPanel drivers={stats.top_drivers} />
        </div>
      )}

      <div className="card">
        {/* Toolbar */}
        <div className="card-hd">
          <div className="action-group">
            <button className="btn-icon" title="External Submission Link" type="button" onClick={() => setShowExtLink(true)}>
              <Link2 size={16} />
            </button>
            <button className="btn-icon" title="Refresh" type="button" onClick={() => qc.invalidateQueries({ queryKey: ['incidents'] })}>
              <RefreshCw size={16} />
            </button>
            {canPrint && (
              <button className="btn-icon" title="Print Report" type="button" onClick={() => setShowPrint(true)}>
                <Printer size={16} />
              </button>
            )}
            {canManageInc && (
              <button className="btn btn-primary btn-compact" type="button" onClick={() => setShowAdd(true)}>
                + Add Incident
              </button>
            )}
          </div>
        </div>

        {/* Owner nudge banner */}
        {members.length === 0 && (
          <div className="inc-nudge">
            No owners configured. Go to <strong>Settings → Lookups</strong> to add owners and enable the <strong>Reported By</strong> dropdown.
          </div>
        )}

        {/* Filter bar */}
        <div className="filter-bar">
          <div className="filter-field">
            <label className="filter-label">Incident ID</label>
            <input type="text" value={filterId} onChange={e => setFilterId(e.target.value)} placeholder="e.g. INC-2026-001" onKeyDown={e => e.key === 'Enter' && applyFilters()} />
          </div>
          <div className="filter-field">
            <label className="filter-label">Category</label>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="">All</option>
              {incidentCategories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <label className="filter-label">Severity</label>
            <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
              <option value="">All</option>
              {severityLabels.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="filter-field">
            <label className="filter-label">Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          {businessUnits.length > 0 && (
            <div className="filter-field">
              <label className="filter-label">Business Unit</label>
              <select value={filterBusinessUnit} onChange={e => setFilterBU(e.target.value)}>
                <option value="">All</option>
                {businessUnits.map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
          )}
          <div className="filter-field grow">
            <label className="filter-label">Quick Search</label>
            <input type="text" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Search description, reporter…" onKeyDown={e => e.key === 'Enter' && applyFilters()} />
          </div>
          <div className="filter-actions">
            <button className="btn btn-secondary" type="button" onClick={clearFilters}>Clear</button>
            <button className="btn btn-primary" type="button" onClick={applyFilters}>Search</button>
          </div>
        </div>

        {error && <p style={{ color: '#dc2626', padding: '8px 16px', fontSize: 13 }}>{error}</p>}
        {loading && <p className="muted" style={{ padding: '8px 16px' }}>Loading…</p>}

        <IncidentTable
          incidents={incidents}
          flashId={flashId}
          onOpen={setDetailInc}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPrev={() => loadPage(page - 1)}
          onNext={() => loadPage(page + 1)}
        />
      </div>

      <AddIncidentModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={handleAdd}
        members={members}
        categories={incidentCategories}
        severities={severityLabels}
        channels={CHANNELS}
      />

      {/* Detail / Edit Drawer */}
      {detailInc && (
        <IncidentDetailDrawer
          incident={detailInc}
          members={members}
          onClose={() => setDetailInc(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}

      {/* Print Modal */}
      {showPrint && <IncidentPrintModal onClose={() => setShowPrint(false)} />}

      {/* External Link Modal */}
      {showExtLink && (
        <IncidentExternalLinkModal
          workspaceId={claims?.active_tenant_id ?? ''}
          onClose={() => setShowExtLink(false)}
        />
      )}
    </>
  );
}