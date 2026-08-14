// src/pages/Incidents.tsx

import { useEffect, useState, useCallback } from 'react';
import { Link2, RefreshCw, Printer } from 'lucide-react';
import { useFeedbackStore } from '../store/feedbackStore';
import { useIncidents } from '../hooks/useIncidents';
import { useAuth } from '../hooks/useAuth';
import { useLookups } from '../hooks/useLookups';
import IncidentStatCards from '../components/incidents/IncidentStatCards';
import IncidentTable from '../components/incidents/IncidentTable';
import IncidentDetailDrawer from '../components/incidents/IncidentDetailDrawer';
import IncidentPrintModal from '../components/incidents/IncidentPrintModal';
import IncidentExternalLinkModal from '../components/incidents/IncidentExternalLinkModal';
import type { Incident, IncidentCreate } from '../types/incident';
import { useCanDo } from '../utils/permissions';

const PAGE_SIZE = 10;

const SEVERITIES = ['Low', 'Medium', 'High', 'Very High'];
const STATUSES   = ['New', 'Open', 'In Progress', 'Under Review', 'Resolved', 'Closed'];
const CHANNELS   = ['Email', 'Phone', 'Walk-in', 'Monitoring', 'Other'];

export default function Incidents() {
  const { claims } = useAuth();
  const canManageInc = useCanDo('manage_incidents');
  const canPrint     = useCanDo('print_reports');
  const { incidents, total, loading, error, stats, statsLoading, fetch, fetchStats, create, remove } = useIncidents();
  const { lookups } = useLookups();

  // Pagination + filters
  const [page, setPage]                   = useState(1);
  const [filterId, setFilterId]           = useState('');
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

  // Add form state
  const [addForm, setAddForm] = useState<Partial<IncidentCreate>>({
    severity: 'Medium',
    status: 'New',
    reported_at: new Date().toISOString().slice(0, 10),
  });
  const [addBusy, setAddBusy] = useState(false);

  const members = (lookups?.risk_owner ?? []).map(o => ({ name: o, email: o }));
  const incidentCategories = lookups?.incident_category ?? ['Cybersecurity', 'IT Operations', 'Physical Security', 'Data Protection', 'Compliance', 'Other'];
  const businessUnits = lookups?.business_unit ?? [];

  const loadPage = useCallback((p: number) => {
    setPage(p);
    fetch({
      page:          p,
      page_size:     PAGE_SIZE,
      incident_id:   filterId          || undefined,
      category:      filterCategory    || undefined,
      severity:      filterSeverity    || undefined,
      status:        filterStatus      || undefined,
      business_unit: filterBusinessUnit || undefined,
      search:        filterSearch      || undefined,
    });
  }, [fetch, filterId, filterCategory, filterSeverity, filterStatus, filterBusinessUnit, filterSearch]);

  useEffect(() => {
    fetch({ page: 1, page_size: PAGE_SIZE });
    fetchStats();
  }, []);

  function applyFilters() { loadPage(1); }
  function clearFilters() {
    setFilterId(''); setFilterCategory(''); setFilterSeverity(''); setFilterStatus(''); setFilterBU(''); setFilterSearch('');
    fetch({ page: 1, page_size: PAGE_SIZE });
    setPage(1);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.description || !addForm.category || !addForm.reported_by || !addForm.reported_at) return;
    setAddBusy(true);
    try {
      const inc = await create(addForm as IncidentCreate);
      if (inc) {
        useFeedbackStore.getState().trigger('log_incident', 'How was logging your first incident?');
        setShowAdd(false);
        setAddForm({ severity: 'Medium', status: 'New' });
        setFlashId(inc.id);
        setTimeout(() => setFlashId(null), 3500);
        fetchStats();
      }
    } finally {
      setAddBusy(false);
    }
  }

  function handleSaved(updated: Incident) {
    setDetailInc(null);
    setFlashId(updated.id);
    setTimeout(() => setFlashId(null), 3500);
    loadPage(page);
    fetchStats();
  }

  function handleDeleted(id: string) {
    setDetailInc(null);
    remove(id);
    fetchStats();
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <IncidentStatCards stats={stats} loading={statsLoading} />

      <div className="card">
        {/* Toolbar */}
        <div className="card-hd">
          <div className="action-group">
            <button className="btn-icon" title="External Submission Link" type="button" onClick={() => setShowExtLink(true)}>
              <Link2 size={16} />
            </button>
            <button className="btn-icon" title="Refresh" type="button" onClick={() => { loadPage(page); fetchStats(); }}>
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
              {SEVERITIES.map(s => <option key={s}>{s}</option>)}
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

      {/* Add Incident Drawer */}
      {showAdd && (
        <>
          <div className="drawer-backdrop" onClick={() => setShowAdd(false)} />
          <aside className="drawer open" aria-label="Add Incident">
            <div className="drawer-hd">
              <div>
                <div className="drawer-title">Add Incident</div>
                <div className="drawer-sub muted">Log a new incident into your register.</div>
              </div>
              <button className="icon-btn" onClick={() => setShowAdd(false)} type="button">✕</button>
            </div>
            <div className="drawer-bd">
              <form onSubmit={handleAdd} className="form">
                <div className="grid2">
                  <div className="field">
                    <label>Date Reported *</label>
                    <input type="date" defaultValue={today} required onChange={e => setAddForm(f => ({ ...f, reported_at: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Reported By *</label>
                    <select required onChange={e => setAddForm(f => ({ ...f, reported_by: e.target.value }))}>
                      <option value="">—</option>
                      {members.map((m) => <option key={m.email} value={m.name || m.email}>{m.name || m.email}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Reporter Email</label>
                    <input type="email" placeholder="e.g. alex@company.com" onChange={e => setAddForm(f => ({ ...f, reporter_email: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Channel</label>
                    <select onChange={e => setAddForm(f => ({ ...f, channel: e.target.value }))}>
                      <option value="">—</option>
                      {CHANNELS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Incident Category *</label>
                    <select required onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}>
                      <option value="">—</option>
                      {incidentCategories.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Incident Type</label>
                    <input type="text" placeholder="e.g. Phishing attempt" onChange={e => setAddForm(f => ({ ...f, incident_type: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Severity *</label>
                    <select defaultValue="Medium" required onChange={e => setAddForm(f => ({ ...f, severity: e.target.value }))}>
                      {SEVERITIES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Incident Date</label>
                    <input type="date" onChange={e => setAddForm(f => ({ ...f, incident_dt: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <label>Description *</label>
                  <textarea rows={3} placeholder="What happened?" required onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="grid2">
                  <div className="field">
                    <label>Affected Asset</label>
                    <input type="text" placeholder="e.g. Payroll records" onChange={e => setAddForm(f => ({ ...f, affected_asset: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Business Unit</label>
                    <input type="text" placeholder="e.g. Finance" onChange={e => setAddForm(f => ({ ...f, business_unit: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Immediate Actions Taken</label>
                    <textarea rows={2} placeholder="e.g. Blocked sender, reset password" onChange={e => setAddForm(f => ({ ...f, immediate_actions: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Assigned Owner</label>
                    <select onChange={e => setAddForm(f => ({ ...f, assigned_to: e.target.value }))}>
                      <option value="">—</option>
                      {members.map(m => <option key={m.email} value={m.name || m.email}>{m.name || m.email}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Financial Impact</label>
                    <input type="text" placeholder="e.g. 0 / Unknown / Estimate" onChange={e => setAddForm(f => ({ ...f, financial_impact: e.target.value }))} />
                  </div>
                </div>
                <div className="drawer-ft">
                  <button className="btn btn-secondary" type="button" onClick={() => setShowAdd(false)}>Cancel</button>
                  <button className="btn btn-primary" type="submit" disabled={addBusy}>{addBusy ? 'Creating…' : 'Create Incident'}</button>
                </div>
              </form>
            </div>
          </aside>
        </>
      )}

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