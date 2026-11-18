// src/pages/RiskRegister.tsx
// Risk Register in the Pulse layout: summary line, actions, quick views with
// counts, filters, bulk bar, the register table and the side panel.
// Adding and editing happen on their own page (RiskFormPage).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, MoreHorizontal, Plus, SlidersHorizontal, Upload } from 'lucide-react';
import { useRisks } from '../hooks/useRisks';
import { useLookups } from '../hooks/useLookups';
import { useMatrix } from '../hooks/useMatrix';
import { useTriagePendingCount } from '../hooks/useSubmissions';
import { useToast } from '../hooks/useToast';
import { useCanDo } from '../utils/permissions';
import { getRisk, getViewCounts, listRisks, type ListRisksParams } from '../services/risks';
import { buildRiskCsv, downloadCsv, type ExportScope } from '../utils/riskExport';
import { REGISTER_PAGE_SIZE, REGISTER_VIEWS, plural, type RegisterView } from '../utils/riskDisplay';
import RiskTable from '../components/risks/RiskTable';
import RiskPanel from '../components/risks/RiskPanel';
import ImportModal from '../components/risks/ImportModal';
import AIModal from '../components/risks/AIModal';
import DeleteModal from '../components/risks/DeleteModal';
import PrintModal from '../components/risks/PrintModal';
import RecycleBinModal from '../components/recycle/RecycleBinModal';
import Explain from '../components/help/Explain';
import type { Risk, AIInsightRequest, AIInsightResult } from '../types/risk';

export default function RiskRegister() {
  const canManage = useCanDo('manage_risks');
  const canAI     = useCanDo('generate_ai');
  const canExport = useCanDo('print_reports');
  const canAudit  = useCanDo('manage_settings');
  const navigate  = useNavigate();
  const toast     = useToast();
  const qc        = useQueryClient();
  const { lookups } = useLookups();
  const { query: matrixQuery } = useMatrix();
  const bandCount = matrixQuery.data?.band_count ?? 4;
  const { data: triageCountData } = useTriagePendingCount();
  const triagePending = triageCountData?.count ?? 0;

  // ── Filters ───────────────────────────────────────────────────────────────
  const [view, setView]         = useState<RegisterView>('all');
  const [search, setSearch]     = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState('');
  const [owner, setOwner]       = useState('');
  const [level, setLevel]       = useState('');
  const [appetite, setAppetite] = useState('');
  const [treatment, setTreatment] = useState('');
  const [moreFilters, setMoreFilters] = useState(false);
  const [page, setPage]         = useState(1);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const riskParams: ListRisksParams = {
    page, page_size: REGISTER_PAGE_SIZE, sort: 'residual',
    search:    debounced || undefined,
    category:  category  || undefined,
    owner:     owner     || undefined,
    level:     level     || undefined,
    treatment: treatment || undefined,
    appetite:  view === 'exceeds' ? 'Exceeds' : (appetite || undefined),
    elevated:    view === 'elevated' || undefined,
    undecided:   view === 'undecided' || undefined,
    past_target: view === 'past_target' || undefined,
  };
  const { risks, quota, total, loading, error, update, remove, importRisks, generateAI } = useRisks(riskParams);

  const viewParams = {
    search: debounced || undefined, category: category || undefined,
    owner: owner || undefined, level: level || undefined,
  };
  const counts = useQuery({
    queryKey: ['risks', 'views', viewParams],
    queryFn: () => getViewCounts(viewParams),
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1); };
  }

  function clearFilters() {
    setSearch(''); setCategory(''); setOwner(''); setLevel('');
    setAppetite(''); setTreatment(''); setView('all'); setPage(1);
  }
  const filtersActive = !!(search || category || owner || level || appetite || treatment || view !== 'all');

  // ── Selection, panel, modals ──────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openRisk, setOpenRisk]       = useState<Risk | null>(null);
  const [menuOpen, setMenuOpen]       = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [showAI, setShowAI]           = useState(false);
  const [showBin, setShowBin]         = useState(false);
  const [showExport, setShowExport]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Risk | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Keep the open panel in step with refetched rows (after a decision is saved, for example).
  const panelRisk = openRisk ? (risks.find(r => r.id === openRisk.id) ?? openRisk) : null;

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // ── Deep links ────────────────────────────────────────────────────────────
  //   /risks?risk=R-002            opens the side panel
  //   /risks?edit=R-002            goes to the edit page
  //   /risks?new=1&category=Cyber  goes to the add page, category prefilled when valid
  const [searchParams, setSearchParams] = useSearchParams();
  const handledLink = useRef<string | null>(null);
  const linkKey = searchParams.toString();

  useEffect(() => {
    const viewId = searchParams.get('risk');
    const editId = searchParams.get('edit');
    const wantsNew = searchParams.get('new') === '1';
    if (!viewId && !editId && !wantsNew) return;
    if (handledLink.current === linkKey) return;
    handledLink.current = linkKey;

    if (wantsNew) {
      if (!canManage) { toast('You do not have permission to add risks.', 'error'); }
      else {
        const cat = searchParams.get('category');
        navigate(`/risks/new${cat ? `?category=${encodeURIComponent(cat)}` : ''}`, { replace: true });
        return;
      }
    }
    if (editId) {
      if (!canManage) { toast('You do not have permission to edit risks.', 'error'); }
      else { navigate(`/risks/${encodeURIComponent(editId)}/edit`, { replace: true }); return; }
    }

    const next = new URLSearchParams(searchParams);
    ['risk', 'edit', 'new', 'category'].forEach(k => next.delete(k));
    setSearchParams(next, { replace: true });

    const id = viewId ?? editId;
    if (!id) return;
    getRisk(id)
      .then(r => setOpenRisk(r))
      .catch(() => toast(`Risk ${id} could not be opened. It may have been deleted.`, 'error'));
  }, [linkKey, searchParams, setSearchParams, canManage, navigate, toast]);

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
      const all = pageIds.length > 0 && pageIds.every(id => prev.has(id));
      const next = new Set(prev);
      pageIds.forEach(id => (all ? next.delete(id) : next.add(id)));
      return next;
    });
  }, [risks]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await remove(deleteTarget.id);
      toast(`${deleteTarget.id} moved to the recycle bin.`, 'success');
      setSelectedIds(prev => { const n = new Set(prev); n.delete(deleteTarget.id); return n; });
      setDeleteTarget(null);
      setOpenRisk(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The risk could not be deleted.', 'error');
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleLinkDecision(decision: string) {
    if (!panelRisk) return;
    try {
      const updated = await update(panelRisk.id, { linked_decision: decision });
      if (updated) setOpenRisk(updated);
      toast('Decision recorded.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The decision could not be saved.', 'error');
      throw e;
    }
  }

  async function handleGenerateAI(opts: {
    uiTarget: 'new' | 'filtered' | 'selected';
    notes?: string;
    overwrite: boolean;
  }): Promise<AIInsightResult | null> {
    let payload: AIInsightRequest;
    if (opts.uiTarget === 'new') {
      payload = { target: 'empty', notes: opts.notes, overwrite: opts.overwrite };
    } else if (opts.uiTarget === 'filtered') {
      const resp = await listRisks({ ...riskParams, page: 1, page_size: 1000 });
      payload = { target: 'selected', risk_ids: resp.items.map(r => r.id), notes: opts.notes, overwrite: opts.overwrite };
    } else {
      if (selectedIds.size === 0) return null;
      payload = { target: 'selected', risk_ids: [...selectedIds], notes: opts.notes, overwrite: opts.overwrite };
    }
    return generateAI(payload);
  }

  async function handleExport(scope: ExportScope, columns: string[]) {
    setShowExport(false);
    const PAGE = 1000; // backend max page_size
    const base: ListRisksParams = scope === 'filtered' ? { ...riskParams } : { sort: 'residual' };
    const all: Risk[] = [];
    try {
      for (let p = 1; ; p++) {
        const resp = await listRisks({ ...base, page: p, page_size: PAGE });
        all.push(...resp.items);
        if (resp.items.length < PAGE || all.length >= resp.meta.total) break;
      }
    } catch {
      toast('Export failed. Please try again.', 'error');
      return;
    }
    const rows = scope === 'selected' ? all.filter(r => selectedIds.has(r.id)) : all;
    if (!rows.length) { toast('No risks to export.', 'info'); return; }
    downloadCsv(buildRiskCsv(rows, columns), `risk_register_${new Date().toISOString().slice(0, 10)}.csv`);
  }

  // ── Display ───────────────────────────────────────────────────────────────
  const c = counts.data;
  const summary = c
    ? [
        `${plural(c.all, 'risk')}${filtersActive ? ' match the filters' : ' on the register'}.`,
        c.avg_residual != null ? `Average residual ${Math.round(c.avg_residual)} of ${c.residual_max}.` : '',
        c.all > 0 ? `${c.exceeds === 0 ? 'None' : c.exceeds} outside appetite.` : '',
      ].filter(Boolean).join(' ')
    : '';
  const viewCount: Record<RegisterView, number | undefined> = {
    all: c?.all, exceeds: c?.exceeds, elevated: c?.elevated, undecided: c?.undecided, past_target: c?.past_target,
  };
  const totalPages = Math.max(1, Math.ceil(total / REGISTER_PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * REGISTER_PAGE_SIZE + 1;
  const last = Math.min(page * REGISTER_PAGE_SIZE, total);
  const levelLabels = matrixQuery.data
    ? Array.from({ length: bandCount }, (_, i) => {
        const idx = bandCount - i;
        return matrixQuery.data[`band_${idx}_label` as keyof typeof matrixQuery.data] as string;
      })
    : [];
  const owners = Array.from(new Set([...(lookups?.risk_owner ?? []), ...(owner ? [owner] : [])]));
  const hasMenu = canManage || canAI;

  return (
    <div className="pl-app pl-an-page">
      <div className="pl-an-head">
        <div className="pl-stack-xs">
          <h1 className="pl-page-title">Risk Register</h1>
          <p className="pl-intro">
            {summary} {c && c.all > 0 && <Link to="/analytics">See the analysis</Link>}
          </p>
        </div>
        <div className="pl-inline pl-rr-actions">
          {canManage && (
            <button type="button" className="pl-btn pl-btn-secondary" onClick={() => setShowImport(true)}>
              <Upload size={16} aria-hidden="true" />Import
            </button>
          )}
          {canExport && (
            <button type="button" className="pl-btn pl-btn-secondary" onClick={() => setShowExport(true)}>
              <Download size={16} aria-hidden="true" />Export
            </button>
          )}
          {hasMenu && (
            <div className="pl-rr-menu-wrap" ref={menuRef}>
              <button type="button" className="pl-btn pl-btn-secondary" aria-label="More actions"
                aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
                <MoreHorizontal size={18} aria-hidden="true" />
                {canManage && triagePending > 0 && <span className="pl-rr-dot" aria-hidden="true" />}
              </button>
              {menuOpen && (
                <div className="pl-menu pl-rr-menu" role="menu" aria-label="More actions">
                  {canManage && (
                    <button type="button" role="menuitem" className="pl-menu-item" onClick={() => navigate('/risks/submission-links')}>
                      Share risk submission link
                    </button>
                  )}
                  {canManage && (
                    <button type="button" role="menuitem" className="pl-menu-item" onClick={() => navigate('/risks/triage')}>
                      Submissions inbox
                      {triagePending > 0 && <span className="pl-chip pl-sev-m">{triagePending} new</span>}
                    </button>
                  )}
                  {canAI && (
                    <button type="button" role="menuitem" className="pl-menu-item" onClick={() => { setMenuOpen(false); setShowAI(true); }}>
                      Generate AI insights
                    </button>
                  )}
                  {canManage && (
                    <button type="button" role="menuitem" className="pl-menu-item" onClick={() => { setMenuOpen(false); setShowBin(true); }}>
                      Recycle bin
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {canManage && (
            <Link className="pl-btn pl-btn-primary" to="/risks/new">
              <Plus size={16} aria-hidden="true" />Add risk
            </Link>
          )}
        </div>
      </div>

      {quota?.warn && (
        <p className="pl-note pl-alert" role="status">
          This workspace is at {quota.pct}% of its risk limit ({quota.current} of {quota.limit} risks).
        </p>
      )}

      <div className="pl-views" role="group" aria-label="Quick views">
        {REGISTER_VIEWS.map(v => (
          <button key={v.key} type="button" className={`pl-view${view === v.key ? ' pl-on' : ''}`}
            aria-pressed={view === v.key} onClick={() => { setView(v.key); setPage(1); }}>
            {v.label(c?.elevated_label ?? 'Elevated')}
            <span className="pl-view-n">{viewCount[v.key] ?? '…'}</span>
          </button>
        ))}
        <Explain id="undecided" />
      </div>

      <section className="pl-card pl-rr-card" aria-label="Risks">
        <div className="pl-rr-filters">
          <div className="pl-field pl-rr-f-search">
            <label className="pl-field-label" htmlFor="rr-q">Search</label>
            <input id="rr-q" className="pl-input" type="search" value={search}
              onChange={e => setSearch(e.target.value)} placeholder="Risk ID, title, owner or impact" />
          </div>
          <div className="pl-field pl-rr-f">
            <label className="pl-field-label" htmlFor="rr-cat">Category</label>
            <select id="rr-cat" className="pl-input" value={category} onChange={e => resetPage(setCategory)(e.target.value)}>
              <option value="">All categories</option>
              {(lookups?.category ?? []).map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div className="pl-field pl-rr-f">
            <label className="pl-field-label" htmlFor="rr-own">Owner</label>
            <select id="rr-own" className="pl-input" value={owner} onChange={e => resetPage(setOwner)(e.target.value)}>
              <option value="">All owners</option>
              {owners.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div className="pl-field pl-rr-f">
            <label className="pl-field-label" htmlFor="rr-lvl">Level</label>
            <select id="rr-lvl" className="pl-input" value={level} onChange={e => resetPage(setLevel)(e.target.value)}>
              <option value="">All levels</option>
              {levelLabels.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <button type="button" className="pl-btn pl-btn-secondary" aria-expanded={moreFilters} onClick={() => setMoreFilters(m => !m)}>
            <SlidersHorizontal size={16} aria-hidden="true" />More filters
          </button>
          {filtersActive && (
            <button type="button" className="pl-btn pl-btn-ghost" onClick={clearFilters}>Clear filters</button>
          )}
        </div>
        {moreFilters && (
          <div className="pl-rr-filters pl-rr-filters-more">
            <div className="pl-field pl-rr-f">
              <label className="pl-field-label" htmlFor="rr-app">Appetite</label>
              <select id="rr-app" className="pl-input" value={view === 'exceeds' ? 'Exceeds' : appetite}
                disabled={view === 'exceeds'} onChange={e => resetPage(setAppetite)(e.target.value)}>
                <option value="">Any</option>
                <option value="Exceeds">Exceeds</option>
                <option value="Near">Near</option>
                <option value="Within">Within</option>
                <option value="unset">No threshold</option>
              </select>
            </div>
            <div className="pl-field pl-rr-f">
              <label className="pl-field-label" htmlFor="rr-treat">Treatment</label>
              <select id="rr-treat" className="pl-input" value={treatment} onChange={e => resetPage(setTreatment)(e.target.value)}>
                <option value="">Any</option>
                {(lookups?.treatment ?? []).map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          </div>
        )}

        {selectedIds.size > 0 && (
          <div className="pl-rr-bulk" role="region" aria-label="Bulk actions">
            <span className="pl-rr-bulk-n">{selectedIds.size} selected</span>
            {canExport && <button type="button" className="pl-btn pl-btn-sm pl-btn-on-dark" onClick={() => setShowExport(true)}>Export selected</button>}
            {canAI && <button type="button" className="pl-btn pl-btn-sm pl-btn-on-dark" onClick={() => setShowAI(true)}>AI insights</button>}
            <button type="button" className="pl-btn pl-btn-sm pl-btn-on-dark pl-push" onClick={() => setSelectedIds(new Set())}>Clear</button>
          </div>
        )}

        {error && <p className="pl-note pl-alert" role="alert">{error}</p>}

        <RiskTable
          risks={risks}
          loading={loading}
          bandCount={bandCount}
          openId={panelRisk?.id ?? null}
          selectedIds={selectedIds}
          onOpen={setOpenRisk}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
        />

        {!loading && risks.length === 0 && (
          <div className="pl-rr-empty">
            {filtersActive ? (
              <>
                <p className="pl-item-title">No risks match</p>
                <p className="pl-caption">Try another view or clear the filters.</p>
              </>
            ) : (
              <>
                <p className="pl-item-title">No risks yet</p>
                <p className="pl-caption">
                  {canManage ? 'Add your first risk, or import a spreadsheet.' : 'Risks appear here once someone adds them.'}
                </p>
              </>
            )}
          </div>
        )}

        <div className="pl-rr-foot">
          <span className="pl-caption">
            {total > 0 ? `Showing ${first} to ${last} of ${total}, sorted by residual, highest first` : ''}
          </span>
          {totalPages > 1 && (
            <span className="pl-inline">
              <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
              <span className="pl-caption">Page {page} of {totalPages}</span>
              <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
            </span>
          )}
        </div>
      </section>

      {panelRisk && (
        <RiskPanel
          key={panelRisk.id}
          risk={panelRisk}
          bandCount={bandCount}
          canManage={canManage}
          canSeeAudit={canAudit}
          onClose={() => setOpenRisk(null)}
          onEdit={() => navigate(`/risks/${encodeURIComponent(panelRisk.id)}/edit`)}
          onDelete={() => { setDeleteTarget(panelRisk); setOpenRisk(null); }}
          onLinkDecision={handleLinkDecision}
        />
      )}

      <ImportModal open={showImport} onClose={() => setShowImport(false)} onImport={rows => importRisks(rows)} />
      <AIModal
        open={showAI}
        onClose={() => setShowAI(false)}
        selectedCount={selectedIds.size}
        filteredCount={total}
        onGenerate={handleGenerateAI}
      />
      <DeleteModal
        open={deleteTarget !== null}
        riskId={deleteTarget?.id ?? null}
        desc={deleteTarget?.display_title ?? null}
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
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
        key={showExport ? 'open' : 'closed'}
        open={showExport}
        selectedCount={selectedIds.size}
        onClose={() => setShowExport(false)}
        onGenerate={handleExport}
      />
    </div>
  );
}
