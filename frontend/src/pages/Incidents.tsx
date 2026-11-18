// src/pages/Incidents.tsx
// Incident log in the Pulse layout: summary line, actions, quick views with
// counts, filters, the log table and the side panel. Logging and editing
// happen on their own page (IncidentFormPage). Counts and wording come from
// GET /incidents/views and the list rows; nothing is derived here.

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useIncidents, invalidateIncidentQueries } from '../hooks/useIncidents';
import { useIncidentSeverity } from '../hooks/useIncidentSeverity';
import { useLookups } from '../hooks/useLookups';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useCanDo } from '../utils/permissions';
import {
  deleteIncident, getIncidentPageInsights, getIncidentViewCounts, updateIncident, type ListIncidentsParams,
} from '../services/incidents';
import { INCIDENT_PAGE_SIZE, INCIDENT_VIEWS, insightParts, type IncidentView } from '../utils/incidentDisplay';
import IncidentTable from '../components/incidents/IncidentTable';
import IncidentPanel from '../components/incidents/IncidentPanel';
import IncidentPrintModal from '../components/incidents/IncidentPrintModal';
import IncidentExternalLinkModal from '../components/incidents/IncidentExternalLinkModal';
import RecycleBinModal from '../components/recycle/RecycleBinModal';
import type { IncidentPageInsight, IncidentStage } from '../types/incident';

export default function Incidents() {
  const canManage  = useCanDo('manage_incidents');
  const canAddRisk = useCanDo('manage_risks');
  const canAI      = useCanDo('generate_ai');
  const canPrint   = useCanDo('print_reports');
  const canAudit   = useCanDo('manage_settings');
  const { claims } = useAuth();
  const navigate   = useNavigate();
  const toast      = useToast();
  const qc         = useQueryClient();
  const { lookups } = useLookups();
  const { config: sevConfig } = useIncidentSeverity();
  const levels = (sevConfig.data?.levels ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const sevRank: Record<string, number> = Object.fromEntries(levels.map((l, i) => [l.label, i]));

  // ── Filters ───────────────────────────────────────────────────────────────
  const [view, setView]           = useState<IncidentView>('open');
  const [search, setSearch]       = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory]   = useState('');
  const [severity, setSeverity]   = useState('');
  const [owner, setOwner]         = useState('');
  const [page, setPage]           = useState(1);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const filterParams = {
    search:   debounced || undefined,
    category: category  || undefined,
    severity: severity  || undefined,
    owner:    owner     || undefined,
  };
  const listParams: ListIncidentsParams = { ...filterParams, view, page, page_size: INCIDENT_PAGE_SIZE };
  const { incidents, total, loading, error } = useIncidents(listParams);

  const counts = useQuery({
    queryKey: ['incidents', 'views', filterParams],
    queryFn: () => getIncidentViewCounts(filterParams),
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  function pick(setter: (v: string) => void) {
    return (v: string) => { setter(v); setPage(1); };
  }
  function clearFilters() {
    setSearch(''); setCategory(''); setSeverity(''); setOwner(''); setView('open'); setPage(1);
  }
  const filtersActive = !!(search || category || severity || owner || view !== 'open');

  // ── Selection, panel, menu, modals ────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen]       = useState(false);
  const [showPrint, setShowPrint]     = useState(false);
  const [showLink, setShowLink]       = useState(false);
  const [showBin, setShowBin]         = useState(false);
  const [insight, setInsight]         = useState<IncidentPageInsight | null>(null);
  const [insightBusy, setInsightBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // ── Deep links (the open panel lives in the URL, so it can be shared) ───
  //   /incidents?incident=INC-2026-001  opens the side panel
  //   /incidents?edit=INC-2026-001      goes to the edit page
  //   /incidents?new=1                  goes to the log page
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('incident');
  const editId = searchParams.get('edit');
  const wantsNew = searchParams.get('new') === '1';

  function setOpenId(id: string | null) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id) next.set('incident', id); else next.delete('incident');
      return next;
    }, { replace: true });
  }

  useEffect(() => {
    if (!editId && !wantsNew) return;
    if (wantsNew && canManage) { navigate('/incidents/new', { replace: true }); return; }
    if (editId && canManage) { navigate(`/incidents/${encodeURIComponent(editId)}/edit`, { replace: true }); return; }
    toast(`You do not have permission to ${wantsNew ? 'log' : 'edit'} incidents.`, 'error');
    const next = new URLSearchParams(searchParams);
    next.delete('edit'); next.delete('new');
    if (editId) next.set('incident', editId);
    setSearchParams(next, { replace: true });
  }, [editId, wantsNew, canManage, navigate, toast, searchParams, setSearchParams]);

  function handleToggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleToggleAll() {
    setSelectedIds(prev => {
      const pageIds = incidents.map(r => r.id);
      const all = pageIds.length > 0 && pageIds.every(id => prev.has(id));
      const next = new Set(prev);
      pageIds.forEach(id => (all ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  async function handlePatch(patch: { status?: IncidentStage; linked_risk_id?: string }, done: string) {
    if (!openId) return;
    try {
      await updateIncident(openId, patch);
      invalidateIncidentQueries(qc);
      toast(done, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The incident could not be saved.', 'error');
      throw e;
    }
  }

  async function handleDelete() {
    if (!openId) return;
    const id = openId;
    try {
      await deleteIncident(id);
      invalidateIncidentQueries(qc);
      toast(`${id} moved to the recycle bin.`, 'success');
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      setOpenId(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The incident could not be deleted.', 'error');
      throw e;
    }
  }

  async function handleInsights() {
    setMenuOpen(false);
    setInsightBusy(true);
    try {
      setInsight(await getIncidentPageInsights());
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The AI insights could not be generated.', 'error');
    } finally {
      setInsightBusy(false);
    }
  }

  // ── Display ───────────────────────────────────────────────────────────────
  const c = counts.data;
  const viewCount: Record<IncidentView, number | undefined> = {
    open: c?.open, unlinked: c?.unlinked, high: c?.high, resolved: c?.resolved, all: c?.all,
  };
  const totalPages = Math.max(1, Math.ceil(total / INCIDENT_PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * INCIDENT_PAGE_SIZE + 1;
  const last = Math.min(page * INCIDENT_PAGE_SIZE, total);
  const owners = Array.from(new Set([...(c?.owners ?? []), ...(lookups?.risk_owner ?? []), ...(owner ? [owner] : [])])).sort();
  const openRow = openId ? (incidents.find(r => r.id === openId) ?? null) : null;
  const hasMenu = canManage || canAI || canPrint;

  return (
    <div className="pl-app pl-an-page">
      <div className="pl-an-head">
        <div className="pl-stack-xs">
          <h1 className="pl-page-title">Incidents</h1>
          <p className="pl-intro">
            {c?.summary} {c && c.all > 0 && <Link to="/analytics#incidents">See the analysis</Link>}
          </p>
        </div>
        <div className="pl-inline pl-rr-actions">
          {canManage && (
            <button type="button" className="pl-btn pl-btn-secondary" onClick={() => setShowLink(true)}>
              Share reporting link
            </button>
          )}
          {hasMenu && (
            <div className="pl-rr-menu-wrap" ref={menuRef}>
              <button type="button" className="pl-btn pl-btn-secondary" aria-label="More actions"
                aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
                <MoreHorizontal size={18} aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="pl-menu pl-rr-menu" role="menu" aria-label="More actions">
                  {canPrint && (
                    <button type="button" role="menuitem" className="pl-menu-item" onClick={() => { setMenuOpen(false); setShowPrint(true); }}>
                      Print or export
                    </button>
                  )}
                  {canAI && (
                    <button type="button" role="menuitem" className="pl-menu-item" disabled={insightBusy} onClick={handleInsights}>
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
            <Link className="pl-btn pl-btn-primary" to="/incidents/new">
              <Plus size={16} aria-hidden="true" />Log incident
            </Link>
          )}
        </div>
      </div>

      {insightBusy && <p className="pl-caption" role="status">Generating AI insights…</p>}
      {insight && (
        <section className="pl-card pl-sect" aria-label="AI insights">
          <div className="pl-inline">
            <h2 className="pl-label">AI insights</h2>
            <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm pl-push" onClick={() => setInsight(null)}>Dismiss</button>
          </div>
          {insight.actions.length === 0 && <p className="pl-p">No recommended actions right now.</p>}
          {insight.actions.map((a, i) => (
            <p className="pl-p" key={i}>
              <span className="pl-tag">{a.badge}</span>{' '}
              {insightParts(a.text).map((p, k) => (p.bold ? <b key={k}>{p.text}</b> : <span key={k}>{p.text}</span>))}
            </p>
          ))}
        </section>
      )}

      <div className="pl-views" role="group" aria-label="Quick views">
        {INCIDENT_VIEWS.map(v => (
          <button key={v.key} type="button" className={`pl-view${view === v.key ? ' pl-on' : ''}`}
            aria-pressed={view === v.key} onClick={() => { setView(v.key); setPage(1); }}>
            {v.label(c?.high_label ?? 'High or above')}
            <span className="pl-view-n">{viewCount[v.key] ?? '…'}</span>
          </button>
        ))}
      </div>

      <section className="pl-card pl-rr-card" aria-label="Incidents">
        <div className="pl-rr-filters">
          <div className="pl-field pl-rr-f-search">
            <label className="pl-field-label" htmlFor="in-q">Search</label>
            <input id="in-q" className="pl-input" type="search" value={search}
              onChange={e => setSearch(e.target.value)} placeholder="Incident ID, title, owner or description" />
          </div>
          <div className="pl-field pl-rr-f">
            <label className="pl-field-label" htmlFor="in-cat">Category</label>
            <select id="in-cat" className="pl-input" value={category} onChange={e => pick(setCategory)(e.target.value)}>
              <option value="">All categories</option>
              {(lookups?.incident_category ?? []).map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div className="pl-field pl-rr-f">
            <label className="pl-field-label" htmlFor="in-sev">Severity</label>
            <select id="in-sev" className="pl-input" value={severity} onChange={e => pick(setSeverity)(e.target.value)}>
              <option value="">All severities</option>
              {levels.map(l => <option key={l.label} value={l.label}>{l.label}</option>)}
            </select>
          </div>
          <div className="pl-field pl-rr-f">
            <label className="pl-field-label" htmlFor="in-own">Owner</label>
            <select id="in-own" className="pl-input" value={owner} onChange={e => pick(setOwner)(e.target.value)}>
              <option value="">All owners</option>
              {owners.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          {filtersActive && (
            <button type="button" className="pl-btn pl-btn-ghost" onClick={clearFilters}>Clear filters</button>
          )}
        </div>

        {selectedIds.size > 0 && (
          <div className="pl-rr-bulk" role="region" aria-label="Bulk actions">
            <span className="pl-rr-bulk-n">{selectedIds.size} selected</span>
            {canPrint && <button type="button" className="pl-btn pl-btn-sm pl-btn-on-dark" onClick={() => setShowPrint(true)}>Print or export</button>}
            <button type="button" className="pl-btn pl-btn-sm pl-btn-on-dark pl-push" onClick={() => setSelectedIds(new Set())}>Clear</button>
          </div>
        )}

        {error && <p className="pl-note pl-alert" role="alert">{error}</p>}

        <IncidentTable
          incidents={incidents}
          loading={loading}
          sevRank={sevRank}
          openId={openId}
          selectedIds={selectedIds}
          onOpen={r => setOpenId(r.id)}
          onToggle={handleToggle}
          onToggleAll={handleToggleAll}
        />

        {!loading && incidents.length === 0 && (
          <div className="pl-rr-empty">
            {filtersActive ? (
              <>
                <p className="pl-item-title">No incidents match</p>
                <p className="pl-caption">Try another view or clear the filters.</p>
              </>
            ) : (
              <>
                <p className="pl-item-title">No incidents yet</p>
                <p className="pl-caption">
                  {canManage ? 'Log the first incident, or share the reporting link.' : 'Incidents appear here once someone logs them.'}
                </p>
              </>
            )}
          </div>
        )}

        <div className="pl-rr-foot">
          <span className="pl-caption">
            {total > 0 ? `Showing ${first} to ${last} of ${total}, newest first` : ''}
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

      {openId && (
        <IncidentPanel
          key={openId}
          incidentId={openId}
          row={openRow}
          sevRank={sevRank}
          canManage={canManage}
          canAddRisk={canAddRisk}
          canAI={canAI}
          canSeeAudit={canAudit}
          onClose={() => setOpenId(null)}
          onEdit={() => navigate(`/incidents/${encodeURIComponent(openId)}/edit`)}
          onDelete={handleDelete}
          onPatch={handlePatch}
        />
      )}

      {showPrint && <IncidentPrintModal onClose={() => setShowPrint(false)} />}
      {showLink && (
        <IncidentExternalLinkModal workspaceId={claims?.active_tenant_id ?? ''} onClose={() => setShowLink(false)} />
      )}
      <RecycleBinModal
        open={showBin}
        itemType="incident"
        onClose={() => setShowBin(false)}
        onRestored={() => invalidateIncidentQueries(qc)}
      />
    </div>
  );
}
