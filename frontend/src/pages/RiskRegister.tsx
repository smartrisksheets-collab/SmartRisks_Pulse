// src/pages/RiskRegister.tsx

import { useEffect, useState, useCallback } from 'react';
import { useQueryClient, useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useRisks }        from '../hooks/useRisks';
import { useLookups } from '../hooks/useLookups';
import { useCanDo }        from '../utils/permissions';
import { getStats, listRisks, type StatsParams, type ListRisksParams } from '../services/risks';
import { useMatrix } from '../hooks/useMatrix';
import { usePendingCount } from '../hooks/useExternalSubmissions';
import { useToast } from '../hooks/useToast';
import StatCards           from '../components/risks/StatCards';
import RiskTable           from '../components/risks/RiskTable';
import AddRiskModal        from '../components/risks/AddRiskModal';
import EditRiskModal       from '../components/risks/EditRiskModal';
import RiskDetailModal     from '../components/risks/RiskDetailModal';
import ImportModal         from '../components/risks/ImportModal';
import AIModal                  from '../components/risks/AIModal';
import DeleteModal              from '../components/risks/DeleteModal';
import PrintModal               from '../components/risks/PrintModal';
import ExternalLinkModal        from '../components/risks/ExternalLinkModal';
import PendingSubmissionsModal  from '../components/risks/PendingSubmissionsModal';
import RecycleBinModal          from '../components/recycle/RecycleBinModal';
import { useAuth }              from '../hooks/useAuth';
import type { Risk, RiskCreate, AIInsightRequest, AIInsightResult } from '../types/risk';

const PAGE_SIZE = 5;

export default function RiskRegister() {
  const canManage = useCanDo('manage_risks');
  const canAI     = useCanDo('generate_ai');
  const canPrint  = useCanDo('print_reports');
  const { claims } = useAuth();
  const navigate = useNavigate();
  const toast    = useToast();
  const qc       = useQueryClient();
  const { query: matrixQuery } = useMatrix();
  const { data: pendingData } = usePendingCount();
  const pendingCount = pendingData?.count ?? 0;

  // Filters
  const [riskId, setRiskId]         = useState('');
  const { lookups } = useLookups();
  const [category, setCategory]     = useState('');
  const [owner, setOwner]           = useState('');
  const [level, setLevel]           = useState('');
  const [treatment, setTreatment]   = useState('');
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [flashId, setFlashId]       = useState<string | null>(null);
  const [aiFlashIds, setAiFlashIds] = useState<Set<string>>(new Set());

  // Debounced search + riskId
  const [debouncedSearch, setDebouncedSearch]   = useState('');
  const [debouncedRiskId, setDebouncedRiskId]   = useState('');


  // Risk list query — params declared after all state is initialised
  const riskParams: ListRisksParams = {
    page, page_size: PAGE_SIZE,
    risk_id:   debouncedRiskId || undefined,
    search:    debouncedSearch || undefined,
    level:     level           || undefined,
    treatment: treatment       || undefined,
    owner:     owner           || undefined,
    category:  category        || undefined,
  };
    const { risks, quota, total, loading, create, update, remove, importRisks, generateAI } = useRisks(riskParams);

  // Modals
  const [showAdd, setShowAdd]       = useState(false);
  const [showEdit, setShowEdit]     = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAI, setShowAI]           = useState(false);
  const [showBin, setShowBin]         = useState(false);
  const [showDelete, setShowDelete]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Risk | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showPrint, setShowPrint]           = useState(false);
  const [showExternalLink, setShowExtLink]  = useState(false);
  const [showPending, setShowPending]       = useState(false);
  const [selected, setSelected]     = useState<Risk | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleToggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedIds(prev => {
      const pageIds = risks.map(r => r.id);
      const allSelected = pageIds.length > 0 && pageIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) { pageIds.forEach(id => next.delete(id)); }
      else             { pageIds.forEach(id => next.add(id)); }
      return next;
    });
  }, [risks]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Debounce risk ID
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedRiskId(riskId); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [riskId]);

  // Stats query — cached by filter combination, invalidated by useRisks mutations
  const statsParams: StatsParams = {
    category:  category        || undefined,
    level:     level           || undefined,
    treatment: treatment       || undefined,
    owner:     owner           || undefined,
    search:    debouncedSearch || undefined,
  };
  const statsQuery   = useQuery({
    queryKey:        ['risks', 'stats', statsParams],
    queryFn:         () => getStats(statsParams),
    staleTime:       2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
  const stats        = statsQuery.data    ?? null;
  const statsLoading = statsQuery.isLoading;

  function clearFilters() {
    setRiskId(''); setCategory(''); setOwner('');
    setLevel(''); setTreatment(''); setSearch('');
    setPage(1);
  }

  function openDetail(r: Risk) { setSelected(r); setShowDetail(true); }
  function openEdit(r: Risk)   { setSelected(r); setShowDetail(false); setShowEdit(true); }

  function openDelete(r: Risk) {
    setDeleteTarget(r);
    setShowDelete(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await remove(deleteTarget.id);
      setShowDelete(false);
      setDeleteTarget(null);
    } catch { /* handled in hook */ } finally {
      setDeleteLoading(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  async function handleGenerateAI(opts: {
    uiTarget: 'new' | 'filtered' | 'selected';
    notes?: string;
    overwrite: boolean;
  }): Promise<AIInsightResult | null> {
    let payload: AIInsightRequest;
    if (opts.uiTarget === 'new') {
      payload = { target: 'empty', notes: opts.notes, overwrite: opts.overwrite };
    } else if (opts.uiTarget === 'filtered') {
      const resp = await listRisks({
        page: 1, page_size: 1000,
        risk_id:   debouncedRiskId || undefined,
        search:    debouncedSearch || undefined,
        category:  category  || undefined,
        level:     level     || undefined,
        treatment: treatment || undefined,
        owner:     owner     || undefined,
      });
      payload = {
        target: 'selected',
        risk_ids: resp.items.map(r => r.id),
        notes: opts.notes,
        overwrite: opts.overwrite,
      };
    } else {
      if (selectedIds.size === 0) return null;
      payload = {
        target: 'selected',
        risk_ids: [...selectedIds],
        notes: opts.notes,
        overwrite: opts.overwrite,
      };
    }
    const r = await generateAI(payload);
    if (r) {
      if (r.updated_ids.length > 0) {
        setAiFlashIds(new Set(r.updated_ids));
        setTimeout(() => setAiFlashIds(new Set()), 2400);
      }
    }
    return r;
  }

  async function handlePrint(scope: 'all' | 'filtered' | 'single', format: 'pdf' | 'csv') {
    setShowPrint(false);
    if (format === 'pdf') {
      toast('PDF export is available in the Report Builder.', 'info');
      navigate('/reports');
      return;
    }
    let toExport: Risk[];
    try {
      const filterParams = {
        risk_id:   debouncedRiskId || undefined,
        search:    debouncedSearch || undefined,
        category:  category        || undefined,
        level:     level           || undefined,
        treatment: treatment       || undefined,
        owner:     owner           || undefined,
      };
      const resp = await listRisks({
        page: 1,
        page_size: 1000,
        ...(scope === 'filtered' ? filterParams : {}),
      });
      toExport = resp.items;
    } catch {
      toast('Export failed. Please try again.', 'error');
      return;
    }
    const header = ['Risk ID', 'Category', 'Description', 'Owner', 'Source', 'Level', 'Treatment', 'Severity', 'Residual', 'Status', 'Logged At'].join(',');
    const rows = toExport.map(r => [
      r.id,
      r.category ?? '',
      `"${(r.description ?? '').replace(/"/g, '""')}"`,
      r.owner ?? '',
      r.source,
      r.level ?? '',
      r.treatment ?? '',
      r.severity ?? '',
      r.residual != null ? Math.round(r.residual) : '',
      r.mitigation_status ?? '',
      r.logged_at ?? '',
    ].join(','));
    const csv  = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const href = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = href; a.download = 'risk_register.csv'; a.click();
    URL.revokeObjectURL(href);
  }

  return (
    <div>
      <StatCards stats={stats} loading={statsLoading} />

      {quota?.warn && (
        <div className="quota-warn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Workspace is at {quota.pct}% capacity ({quota.current}/{quota.limit} risks).
        </div>
      )}

      <div className="card">
        {/* Toolbar */}
        <div className="card-title" style={{ justifyContent: 'flex-end' }}>
          <div className="action-group">
            <button className="btn btn-secondary btn-compact" onClick={clearFilters}>Clear Filters</button>

            {/* External link icon */}
            <button className="btn-icon" title="External Submission Link" onClick={() => setShowExtLink(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
              </svg>
            </button>

            {/* Bell / pending submissions */}
            <button className="btn-icon" title="Pending Submissions" style={{ position: 'relative' }} onClick={() => setShowPending(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
              {pendingCount > 0 && <span className="notif-count">{pendingCount}</span>}
            </button>

            {/* Print */}
            {canPrint && (
              <button className="btn-icon" title="Print Report" onClick={() => setShowPrint(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                </svg>
              </button>
            )}

            {canManage && (
              <button className="btn btn-secondary btn-compact" onClick={() => setShowImport(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Import Risks
              </button>
            )}

            {canAI && (
              <button className="btn btn-compact btn-ai" onClick={() => setShowAI(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                AI Insights
              </button>
            )}

            {canManage && (
              <button className="btn btn-primary btn-compact" onClick={() => setShowAdd(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Risk
              </button>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <div className="filters">
          <div className="field">
            <label>Risk ID</label>
            <input value={riskId} onChange={e => setRiskId(e.target.value)} placeholder="e.g. R-004" style={{ width: 100 }} />
          </div>
          <div className="field">
            <label>Category</label>
            <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>
              <option value="">All</option>
              {(lookups?.category ?? ['Strategic','Operational','Financial','Compliance','Reputational','Technical']).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Owner</label>
            <select value={owner} onChange={e => { setOwner(e.target.value); setPage(1); }}>
              <option value="">All</option>
              {Array.from(new Set(risks.map(r => r.owner).filter(Boolean))).map(o => (
                <option key={o!} value={o!}>{o}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Risk Level</label>
            <select value={level} onChange={e => { setLevel(e.target.value); setPage(1); }}>
              <option value="">All</option>
              {matrixQuery.data
                ? Array.from({ length: matrixQuery.data.band_count }, (_, i) => {
                    const idx = matrixQuery.data!.band_count - i;
                    const label = matrixQuery.data![`band_${idx}_label` as keyof typeof matrixQuery.data] as string;
                    return <option key={idx} value={label}>{label}</option>;
                  })
                : ['Critical', 'High', 'Medium', 'Low'].map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))
              }
            </select>
          </div>
          <div className="field">
            <label>Treatment</label>
            <select value={treatment} onChange={e => { setTreatment(e.target.value); setPage(1); }}>
              <option value="">All</option>
              {(lookups?.treatment ?? ['Mitigate','Transfer','Accept','Avoid']).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 220 }}>
            <label>Quick Search</label>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search description, impact, controls…" />
          </div>
        </div>

        {/* Table */}
        <RiskTable
          risks={risks}
          loading={loading}
          onView={openDetail}
          flashId={flashId}
          aiFlashIds={aiFlashIds}
          selectedIds={selectedIds}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
        />

        {/* Recycle bin link below table */}
        {canManage && (
          <div style={{ marginTop: 8, textAlign: 'right' }}>
            <button className="btn btn-secondary btn-compact" onClick={() => setShowBin(true)}>
              Recycle Bin
            </button>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pager">
            <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Page {page} of {totalPages}</span>
            <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>

      {/* Modals */}
      <AddRiskModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={async (payload: RiskCreate) => {
          const r = await create(payload);
          if (r) {
            setFlashId(r.id);
            setTimeout(() => setFlashId(null), 2400);
          }
          return r;
        }}
      />
      <EditRiskModal
        open={showEdit}
        risk={selected}
        onClose={() => setShowEdit(false)}
        onSubmit={async (id, payload) => {
          const r = await update(id, payload);
          if (r) {
            setFlashId(id);
            setTimeout(() => setFlashId(null), 2400);
          }
          return r;
        }}
      />
      <RiskDetailModal
        open={showDetail}
        risk={selected}
        onClose={() => setShowDetail(false)}
        onEdit={() => openEdit(selected!)}
        onDelete={() => { setShowDetail(false); if (selected) openDelete(selected); }}
      />
      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={async rows => {
          const r = await importRisks(rows);
          return r;
        }}
      />
      <AIModal
        open={showAI}
        onClose={() => setShowAI(false)}
        selectedCount={selectedIds.size}
        filteredCount={total}
        onGenerate={handleGenerateAI}
      />
      <DeleteModal
        open={showDelete}
        riskId={deleteTarget?.id ?? null}
        desc={deleteTarget?.description ?? null}
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => { setShowDelete(false); setDeleteTarget(null); }}
      />
      <RecycleBinModal
        open={showBin}
        onClose={() => setShowBin(false)}
        onRestored={() => {
          qc.invalidateQueries({ queryKey: ['risks'] });
          qc.invalidateQueries({ queryKey: ['dashboard'] });
        }}
      />
      <PrintModal
        open={showPrint}
        onClose={() => setShowPrint(false)}
        onGenerate={handlePrint}
      />
      <ExternalLinkModal
        open={showExternalLink}
        onClose={() => setShowExtLink(false)}
        tenantId={claims?.active_tenant_id ?? ''}
      />
      <PendingSubmissionsModal
        open={showPending}
        onClose={() => setShowPending(false)}
      />
    </div>
  );
}