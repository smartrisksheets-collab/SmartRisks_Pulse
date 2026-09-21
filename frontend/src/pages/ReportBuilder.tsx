// src/pages/ReportBuilder.tsx

import { useState, useEffect, useRef, useCallback } from 'react';
import BlockSelector   from '../components/reports/BlockSelector';
import BlockCanvas     from '../components/reports/BlockCanvas';
import { useReports }  from '../hooks/useReports';
import { useCanDo }    from '../utils/permissions';
import { AI_BLOCKS, type BlockKey, type DatePreset } from '../types/report';

// ── Simple toast (reuses existing .toast CSS classes) ──────────────────────────
function useToast() {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const ToastHost = () => (
    <div id="toastHost">
      {toasts.map((t) => (
        <div key={t.id} className={`toast show ${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );

  return { toast, ToastHost };
}

// ── Confirm dialog ─────────────────────────────────────────────────────────────
function useConfirm() {
  const [state, setState] = useState<{
    open: boolean; title: string; message: string;
    resolve: ((v: boolean) => void) | null;
  }>({ open: false, title: '', message: '', resolve: null });

  const confirm = (title: string, message: string): Promise<boolean> =>
    new Promise((resolve) => setState({ open: true, title, message, resolve }));

  const ConfirmDialog = state.open ? (
    <div className="srs-confirm-backdrop">
      <div className="srs-confirm">
        <div className="srs-confirm-hd">{state.title}</div>
        <div className="srs-confirm-bd">{state.message}</div>
        <div className="srs-confirm-ft">
          <button className="btn btn-secondary" onClick={() => { state.resolve?.(false); setState((s) => ({ ...s, open: false })); }}>Cancel</button>
          <button className="btn btn-navy"      onClick={() => { state.resolve?.(true);  setState((s) => ({ ...s, open: false })); }}>OK</button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, ConfirmDialog };
}

// ── Template modal ─────────────────────────────────────────────────────────────
interface SaveTemplateModalProps {
  onSave:  (name: string, description: string) => void;
  onClose: () => void;
}
function SaveTemplateModal({ onSave, onClose }: SaveTemplateModalProps) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [err,  setErr]  = useState('');
  return (
    <div className="modal-backdrop show">
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-hd"><h2 className="modal-title">Save report template</h2><button className="x" onClick={onClose}>✕</button></div>
        <div className="modal-bd">
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Template name <span style={{ color: '#ef4444' }}>*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Board Risk Pack" />
            {err && <div className="form-error">{err}</div>}
          </div>
          <div className="field">
            <label>Description <span style={{ color: '#94a3b8', fontWeight: 500 }}>(optional)</span></label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="What is this template used for?" />
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => { if (!name.trim()) { setErr('Template name is required'); return; } onSave(name.trim(), desc.trim()); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Email modal ────────────────────────────────────────────────────────────────
interface EmailModalProps {
  reportTitle: string;
  onSend:      (to: string, subject: string) => void;
  onClose:     () => void;
}
function EmailModal({ reportTitle, onSend, onClose }: EmailModalProps) {
  const [to,      setTo]      = useState('');
  const [subject, setSubject] = useState(reportTitle || 'SmartRisk Report');
  const [err,     setErr]     = useState('');
  return (
    <div className="modal-backdrop show">
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-hd"><h2 className="modal-title">Send Report by Email</h2><button className="x" onClick={onClose}>✕</button></div>
        <div className="modal-bd">
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Recipient Email</label>
            <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" />
            {err && <div className="form-error">{err}</div>}
          </div>
          <div className="field">
            <label>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => {
            if (!to.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { setErr('Enter a valid email address'); return; }
            onSend(to.trim(), subject.trim());
            onClose();
          }}>Send</button>
        </div>
      </div>
    </div>
  );
}

// ── Load Template modal ────────────────────────────────────────────────────────
interface LoadTemplateModalProps {
  templates:   import('../types/report').ReportTemplate[];
  onApply:     (id: string) => void;
  onDelete:    (id: string) => void;
  onClose:     () => void;
}
function LoadTemplateModal({ templates, onApply, onDelete, onClose }: LoadTemplateModalProps) {
  return (
    <div className="modal-backdrop show">
      <div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-hd"><h2 className="modal-title">Load template</h2><button className="x" onClick={onClose}>✕</button></div>
        <div className="modal-bd">
          {!templates.length
            ? <p style={{ color: '#64748b', fontSize: 13 }}>No saved templates yet.</p>
            : <div className="rb-tpl-list">
                {templates.map((t) => (
                  <div key={t.template_id} className="rb-tpl-item">
                    <div>
                      <div className="rb-tpl-name">{t.name}</div>
                      <div className="rb-tpl-meta">{t.report_type || ''} · Updated {new Date(t.updated_at).toLocaleDateString()}</div>
                    </div>
                    <div className="action-group">
                      <button className="btn btn-primary btn-compact" onClick={() => { onApply(t.template_id); onClose(); }}>Use</button>
                      <button className="btn btn-ghost btn-compact" style={{ color: '#ef4444' }} onClick={() => onDelete(t.template_id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
        <div className="modal-ft">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Manage Templates modal ─────────────────────────────────────────────────────
interface ManageTemplatesModalProps {
  templates:       import('../types/report').ReportTemplate[];
  onApply:         (id: string) => void;
  onDelete:        (id: string) => Promise<void>;
  onSetDefault:    (id: string, reportType: string) => void;
  onNewTemplate:   () => void;
  onClose:         () => void;
}
function ManageTemplatesModal({
  templates, onApply, onDelete, onSetDefault, onNewTemplate, onClose,
}: ManageTemplatesModalProps) {
  const [search, setSearch] = useState('');
  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="modal-backdrop show">
      <div className="modal" style={{ maxWidth: 820 }}>
        <div className="modal-hd">
          <h2 className="modal-title">Manage Templates</h2>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <div className="rb-manage-toolbar">
          <input
            className="rb-manage-search"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn btn-primary btn-compact" onClick={() => { onClose(); onNewTemplate(); }}>
            + New Template
          </button>
        </div>
        <div className="modal-bd" style={{ padding: 0, overflowX: 'auto' }}>
          {!filtered.length
            ? <p style={{ padding: '20px 16px', color: '#64748b', fontSize: 13 }}>
                {search ? 'No templates match your search.' : 'No saved templates yet.'}
              </p>
            : <table className="rb-manage-tbl">
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Report Type</th>
                    <th>Last Updated</th>
                    <th>Created By</th>
                    <th>Default</th>
                    <th className="rb-th-actions" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.template_id}>
                      <td>
                        <div className="rb-tpl-name">{t.name}</div>
                        {t.description && <div className="rb-tpl-desc">{t.description}</div>}
                        {t.report_type && <span className="rb-type-badge">{t.report_type}</span>}
                      </td>
                      <td>{t.report_type || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(t.updated_at).toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td>{t.created_by || '—'}</td>
                      <td>
                        {t.is_default
                          ? <span className="rb-badge-default">Default</span>
                          : '—'}
                      </td>
                      <td>
                        <div className="action-group">
                          <button className="btn btn-primary btn-compact" onClick={() => { onApply(t.template_id); onClose(); }}>Use</button>
                          <button className="btn btn-ghost btn-compact" onClick={() => onSetDefault(t.template_id, t.report_type)}>Set Default</button>
                          <button className="btn btn-ghost btn-compact" style={{ color: '#ef4444' }} onClick={() => onDelete(t.template_id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
        <div className="modal-ft">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Settings panel ─────────────────────────────────────────────────────────────
interface SettingsPanelProps {
  settings:         import('../types/report').ReportSettings;
  onUpdate:         (p: Partial<import('../types/report').ReportSettings>) => void;
  onUpdateSignoff:  (p: Partial<import('../types/report').ReportSettings['signoff']>) => void;
}
function SettingsPanel({ settings, onUpdate, onUpdateSignoff }: SettingsPanelProps) {
  const [signoffOpen, setSignoffOpen] = useState(false);
  return (
    <div className="rb-settings">
      <div className="rb-lib-title">Report Settings</div>
      <div className="rb-setting">
        <label>Report title</label>
        <input value={settings.report_title} onChange={(e) => onUpdate({ report_title: e.target.value })} placeholder="Q1 Enterprise Risk Report" />
      </div>
      <div className="rb-setting">
        <label>Include cover page</label>
        <select value={settings.cover_page} onChange={(e) => onUpdate({ cover_page: e.target.value as 'Yes' | 'No' })}>
          <option>Yes</option><option>No</option>
        </select>
      </div>
      <div className="rb-setting">
        <label>Footer text</label>
        <input value={settings.footer_text} onChange={(e) => onUpdate({ footer_text: e.target.value })} placeholder="Confidential" />
      </div>
      <div className="rb-setting">
        <label>Prepared for</label>
        <input value={settings.prepared_for} onChange={(e) => onUpdate({ prepared_for: e.target.value })} placeholder="e.g. Executive Management" />
      </div>
      <div className="rb-setting">
        <label>Distribution</label>
        <input value={settings.distribution} onChange={(e) => onUpdate({ distribution: e.target.value })} placeholder="e.g. Board, Senior Management" />
      </div>
      <div className="rb-setting">
        <label>Report reference</label>
        <input value={settings.report_ref} onChange={(e) => onUpdate({ report_ref: e.target.value })} placeholder="e.g. SR-2026-Q1" />
      </div>
      <div className="rb-setting">
        <label>Version</label>
        <input value={settings.version} onChange={(e) => onUpdate({ version: e.target.value })} placeholder="v1.0" />
      </div>
      <div className="rb-setting">
        <label>Page numbering</label>
        <select value={settings.page_numbering} onChange={(e) => onUpdate({ page_numbering: e.target.value as 'Show' | 'Hide' })}>
          <option>Show</option><option>Hide</option>
        </select>
      </div>
      <button className="rb-accordion-head" onClick={() => setSignoffOpen(!signoffOpen)}>
        Report Sign-off <span>{signoffOpen ? '▴' : '▾'}</span>
      </button>
      <div className={`rb-accordion-body${signoffOpen ? ' open' : ''}`}>
        <div className="rb-setting">
          <label><input type="checkbox" checked={settings.signoff.include} onChange={(e) => onUpdateSignoff({ include: e.target.checked })} style={{ marginRight: 6 }} />Include sign-off section</label>
        </div>
        <div className="rb-setting">
          <label>Prepared by</label>
          <input value={settings.signoff.prepared_by} onChange={(e) => onUpdateSignoff({ prepared_by: e.target.value })} placeholder="Jane Smith" />
        </div>
        <div className="rb-setting">
          <label>Title</label>
          <input value={settings.signoff.prepared_title} onChange={(e) => onUpdateSignoff({ prepared_title: e.target.value })} placeholder="Risk Lead" />
        </div>
        <div className="rb-setting">
          <label>Approved by</label>
          <input value={settings.signoff.approved_by} onChange={(e) => onUpdateSignoff({ approved_by: e.target.value })} placeholder="John Doe" />
        </div>
        <div className="rb-setting">
          <label>Approver title</label>
          <input value={settings.signoff.approved_title} onChange={(e) => onUpdateSignoff({ approved_title: e.target.value })} placeholder="Chief Risk Officer" />
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ReportBuilder() {
  const { toast, ToastHost }       = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const rb       = useReports(toast);
  const canPrint = useCanDo('print_reports');

  // Date range state
  const [preset,    setPreset]    = useState<DatePreset>('Last 30 days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo,   setCustomTo]   = useState('');

  // Modal state
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showLoadTemplate, setShowLoadTemplate] = useState(false);
  const [showEmail,           setShowEmail]           = useState(false);
  const [dateMenuOpen,        setDateMenuOpen]        = useState(false);
  const [tplMenuOpen,         setTplMenuOpen]         = useState(false);
  const [showManageTemplates, setShowManageTemplates] = useState(false);

  const dateMenuRef = useRef<HTMLDivElement>(null);
  const tplMenuRef  = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dateMenuRef.current?.contains(e.target as Node)) setDateMenuOpen(false);
      if (!tplMenuRef.current?.contains(e.target as Node))  setTplMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load saved settings and templates on mount
  useEffect(() => {
    rb.loadSavedSettings();
    rb.loadTemplates();
  }, []);

  // Auto-save settings on change (debounced 1200ms)
  const settingsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current);
    settingsSaveTimer.current = setTimeout(() => rb.saveSettings(), 1200);
    return () => { if (settingsSaveTimer.current) clearTimeout(settingsSaveTimer.current); };
  }, [rb.settings]);

  const getRange = () => rb.getRange(preset, customFrom, customTo);

  // Step 1: Preview
  async function handlePreview() {
    if (rb.step > 1 && Object.keys(rb.blockData).length > 0) {
      const ok = await confirm(
        'Re-run Preview?',
        'Re-running Preview will clear your generated AI narratives. Export first if you want to save them.',
      );
      if (!ok) return;
    }
    await rb.preview(getRange());
  }

  // Step 2: AI narrative
  async function handleGenerateAI() {
    await rb.generateAI(getRange());
  }

  // Step 3: Download PDF
  async function handleDownloadPDF() {
    const aiNotRun = rb.activeBlocks.some(b => AI_BLOCKS.has(b)) && Object.keys(rb.aiData).length === 0;
    if (aiNotRun) {
      const proceed = await confirm(
        'AI Narratives Not Generated',
        'It looks like you haven\'t run Generate AI. Your report will export without AI narratives. Continue anyway?',
      );
      if (!proceed) return;
    }
    const ok = await confirm(
      'Confirm Download',
      `Download "${rb.settings.report_title || 'Risk Report'}" report?`,
    );
    if (!ok) return;
    await rb.exportPDF(getRange(), 'download');
  }

  // Step 3: Send by email
  async function handleEmailClick() {
    const aiNotRun = rb.activeBlocks.some(b => AI_BLOCKS.has(b)) && Object.keys(rb.aiData).length === 0;
    if (aiNotRun) {
      const proceed = await confirm(
        'AI Narratives Not Generated',
        'It looks like you haven\'t run Generate AI. Your report will export without AI narratives. Continue anyway?',
      );
      if (!proceed) return;
    }
    setShowEmail(true);
  }

  async function handleSendEmail(to: string, subject: string) {
    await rb.exportPDF(getRange(), 'email', to, subject);
  }

  const step2Disabled = rb.step < 2 || rb.previewing;
  const step3Disabled = rb.step < 2 || rb.previewing;

  return (
    <div className="rb-layout">
      <ToastHost />
      {ConfirmDialog}

      {/* Modals */}
      {showSaveTemplate && (
        <SaveTemplateModal
          onSave={(name, desc) => rb.saveTemplate(name, desc)}
          onClose={() => setShowSaveTemplate(false)}
        />
      )}
      {showLoadTemplate && (
        <LoadTemplateModal
          templates={rb.templates}
          onApply={(id) => rb.applyTemplate(id)}
          onDelete={async (id) => {
            const ok = await confirm('Delete Template', 'Delete this template? This cannot be undone.');
            if (ok) rb.deleteTemplate(id);
          }}
          onClose={() => setShowLoadTemplate(false)}
        />
      )}
      {showManageTemplates && (
        <ManageTemplatesModal
          templates={rb.templates}
          onApply={(id) => rb.applyTemplate(id)}
          onDelete={async (id) => {
            const ok = await confirm('Delete Template', 'Delete this template? This cannot be undone.');
            if (ok) rb.deleteTemplate(id);
          }}
          onSetDefault={(id, type) => rb.setDefaultTemplate(id, type)}
          onNewTemplate={() => setShowSaveTemplate(true)}
          onClose={() => setShowManageTemplates(false)}
        />
      )}
      {showEmail && (
        <EmailModal
          reportTitle={rb.settings.report_title}
          onSend={handleSendEmail}
          onClose={() => setShowEmail(false)}
        />
      )}

      {/* Header card */}
      <div className="rb-card">

        {/* Top row */}
        <div className="rb-top">
          <div className="rb-mark">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#01b88e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="17" x2="9" y2="13"/><line x1="12" y1="17" x2="12" y2="11"/><line x1="15" y1="17" x2="15" y2="14"/>
            </svg>
          </div>

          <div className="rb-title">
            <h1>Report Builder</h1>
            <p>Create insightful reports from your risk data.</p>
          </div>

          <div className="rb-actions">
            {/* New report */}
            <button className="btn btn-soft" type="button" onClick={async () => {
              const ok = await confirm('Start a new report?', 'This will clear your current canvas, settings, and preview data.');
              if (ok) rb.reset();
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New report
            </button>

            {/* Date range dropdown */}
            <div className={`rb-menu-wrap${dateMenuOpen ? ' open' : ''}`} ref={dateMenuRef}>
              <button className="btn btn-outline" type="button" aria-haspopup="true" aria-expanded={dateMenuOpen}
                onClick={() => { setDateMenuOpen(o => !o); setTplMenuOpen(false); }}>
                <span className="lead">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <span>{preset === 'custom' ? 'Custom range' : preset}</span>
                </span>
                <svg className="chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <ul className="rb-menu" role="listbox" aria-label="Reporting period">
                {(['Last 30 days', 'Last 3 months', 'Last 6 months', 'Last 12 months'] as DatePreset[]).map(opt => (
                  <li key={opt}>
                    <button type="button" role="option" aria-selected={preset === opt}
                      onClick={() => { setPreset(opt); setDateMenuOpen(false); }}>
                      {opt}
                    </button>
                  </li>
                ))}
                <li className="rb-menu-sep" />
                <li>
                  <button type="button" role="option" aria-selected={preset === 'custom'}
                    onClick={() => { setPreset('custom'); setDateMenuOpen(false); }}>
                    Custom range…
                  </button>
                </li>
              </ul>
            </div>

            {/* Templates dropdown */}
            <div className={`rb-menu-wrap${tplMenuOpen ? ' open' : ''}`} ref={tplMenuRef}>
              <button className="btn btn-outline" type="button" aria-haspopup="true" aria-expanded={tplMenuOpen}
                onClick={() => { setTplMenuOpen(o => !o); setDateMenuOpen(false); }}>
                <span className="lead">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
                    <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
                  </svg>
                  Templates
                </span>
                <svg className="chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <ul className="rb-menu" role="menu" aria-label="Templates">
                <li><button type="button" role="menuitem" onClick={() => { setTplMenuOpen(false); setShowLoadTemplate(true); }}>Load template</button></li>
                <li><button type="button" role="menuitem" onClick={() => { setTplMenuOpen(false); setShowSaveTemplate(true); }}>Save template</button></li>
                <li><button type="button" role="menuitem" onClick={() => { setTplMenuOpen(false); setShowManageTemplates(true); }}>Manage templates</button></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Custom date inputs */}
        {preset === 'custom' && (
          <div className="rb-date-custom show">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <span className="rb-overlay-text">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}

        {/* Steps */}
        <div className="rb-steps">

          {/* Step 1 */}
          <div className="rb-step">
            <div className="rb-step-head">
              <div className={`rb-num${rb.step > 1 ? ' done' : rb.step === 1 ? ' active' : ''}`}>1</div>
              <h2>Build your report</h2>
            </div>
            <p>Select and arrange the sections you want to include.</p>
            <div className="rb-step-btns">
              <button className="btn btn-primary btn-cta" type="button" onClick={handlePreview} disabled={rb.previewing}>
                {rb.previewing
                  ? <><span className="spinner" />Loading…</>
                  : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v3"/>
                      <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/>
                      <path d="M21.4 12.6a2 2 0 0 1 0 2.83L16 20.82l-3.54.71.71-3.54 5.4-5.4a2 2 0 0 1 2.83 0z"/>
                    </svg>Build</>
                }
              </button>
            </div>
          </div>

          {/* Step 2 */}
          <div className="rb-step">
            <div className="rb-step-head">
              <div className={`rb-num${rb.step > 2 ? ' done' : rb.step === 2 ? ' active' : ''}`}>2</div>
              <h2>Add AI narrative</h2>
              <span className="rb-tag">Recommended</span>
            </div>
            <p>Generate a clear, executive-ready summary with AI.</p>
            <div className="rb-step-btns">
              <button className="btn btn-ai btn-cta" type="button" onClick={handleGenerateAI} disabled={step2Disabled || rb.generatingAI}>
                {rb.generatingAI
                  ? <><span className="spinner" />Generating…</>
                  : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.1 8.6 22 9.6 17 14.4 18.2 21.2 12 18 5.8 21.2 7 14.4 2 9.6 8.9 8.6 12 2"/>
                    </svg>Generate AI Narrative</>
                }
              </button>
            </div>
          </div>

          {/* Step 3 */}
          <div className="rb-step">
            <div className="rb-step-head">
              <div className={`rb-num${rb.step >= 2 ? ' active' : ''}`}>3</div>
              <h2>Share your report</h2>
            </div>
            <p>Send it by email or download a PDF.</p>
            <div className="rb-step-btns">
              <button className="btn btn-secondary" type="button"
                onClick={handleEmailClick}
                disabled={step3Disabled || rb.exporting || !canPrint}
                title={!canPrint ? 'Requires Manager or Owner role' : undefined}>
                {rb.exporting
                  ? <><span className="spinner" />Sending…</>
                  : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/>
                    </svg>Send by Email</>
                }
              </button>
              <button className="btn btn-navy" type="button"
                onClick={handleDownloadPDF}
                disabled={step3Disabled || rb.exporting || !canPrint}
                title={!canPrint ? 'Requires Manager or Owner role' : undefined}>
                {rb.exporting
                  ? <><span className="spinner" />Exporting…</>
                  : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>Download PDF</>
                }
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* 3-panel grid */}
      <div className="rb-grid">

        {/* Left — guide + section library */}
        <div className="rb-left">
          <div className="rb-lib">
            <div className="rb-lib-title">Guide</div>
            <div className="rb-guide-text">
              1. Add sections from below to the canvas.<br />
              2. Click <strong>Preview &amp; Edit</strong> to load live data.<br />
              3. Generate AI narrative, then export.
            </div>
          </div>
          <BlockSelector activeBlocks={rb.activeBlocks} onAdd={(key: BlockKey) => rb.addBlock(key)} />
        </div>

        {/* Centre — canvas */}
        <BlockCanvas
          activeBlocks={rb.activeBlocks}
          blockData={rb.blockData}
          aiData={rb.aiData}
          previewing={rb.previewing}
          onRemove={(key: BlockKey) => rb.removeBlock(key)}
          onReorder={rb.reorderBlocks}
          onEditNarrative={rb.updateNarrative}
          signoff={rb.settings.signoff}
        />

        {/* Right — settings */}
        <SettingsPanel
          settings={rb.settings}
          onUpdate={rb.updateSettings}
          onUpdateSignoff={rb.updateSignoff}
        />
      </div>
    </div>
  );
}