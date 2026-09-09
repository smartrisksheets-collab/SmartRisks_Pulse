// src/pages/Incidents.tsx

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link2, RefreshCw, Printer } from 'lucide-react';
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
import type { Incident, IncidentCreate } from '../types/incident';
import { useCanDo } from '../utils/permissions';
import { useIncidentSeverity } from '../hooks/useIncidentSeverity';

const PAGE_SIZE = 10;

const STATUSES   = ['New', 'Open', 'In Progress', 'Under Review', 'Resolved', 'Closed'];
const CHANNELS   = ['Email', 'Phone', 'Walk-in', 'Monitoring', 'Other'];

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