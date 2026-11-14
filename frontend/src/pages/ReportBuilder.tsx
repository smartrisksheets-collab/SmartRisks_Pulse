// src/pages/ReportBuilder.tsx
// Report Builder (UI step 7): pick sections from the library, see live figures as
// each is added, review the AI text, then export as PDF or PowerPoint, or email it.

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
import BlockSelector from '../components/reports/BlockSelector';
import BlockCanvas from '../components/reports/BlockCanvas';
import ReportDetails from '../components/reports/ReportDetails';
import { ConfirmModal, EmailModal, ManageTemplatesModal, SaveTemplateModal } from '../components/reports/ReportModals';
import Explain from '../components/help/Explain';
import { useReports } from '../hooks/useReports';
import { useConfirm } from '../hooks/useConfirm';
import { useCanDo } from '../utils/permissions';
import { AI_BLOCKS, type ExportFormat, type PeriodPreset, type ReportPeriod } from '../types/report';
import {
  AI_STATUS_TEXT, BUILTIN_PREFIX, BUILTIN_TEMPLATES, PERIOD_OPTIONS, periodText,
} from '../utils/reportPresets';

export default function ReportBuilder() {
  const rb = useReports();
  const { ask, confirmProps } = useConfirm();
  const canPrint = useCanDo('print_reports');
  const canAI    = useCanDo('generate_ai');

  const [exportOpen, setExportOpen] = useState(false);
  const [moreOpen,   setMoreOpen]   = useState(false);
  const [showSaveTpl, setShowSaveTpl] = useState(false);
  const [showManage,  setShowManage]  = useState(false);
  const [showEmail,   setShowEmail]   = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const moreRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setExportOpen(false); setMoreOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const hasAIText = Object.keys(rb.aiData).length > 0;
  const aiKeysWithoutText = rb.activeBlocks.filter(k => AI_BLOCKS.has(k) && !rb.aiData[k]);
  const status = AI_STATUS_TEXT[rb.aiStatus];
  const busy = rb.loadingKeys.length > 0 || rb.generating.length > 0;
  const exportBlocked = !canPrint || !rb.activeBlocks.length || !!rb.periodError || rb.exporting || busy;
  const savedTemplates = rb.templates;
  const templateKnown = rb.template.startsWith(BUILTIN_PREFIX)
    ? BUILTIN_TEMPLATES.some(t => t.id === rb.template)
    : savedTemplates.some(t => t.template_id === rb.template);

  async function keepAIOrConfirm(title: string): Promise<boolean> {
    if (!hasAIText) return true;
    return ask({ title, message: 'The AI text was written for the current sections and period. It will be cleared, and you can write it again.', okText: 'Clear AI text' });
  }

  async function changeTemplate(id: string) {
    if (!id || id === rb.template) return;
    if (!(await keepAIOrConfirm('Switch template?'))) return;
    await rb.applyTemplate(id);
  }

  async function changePeriod(next: ReportPeriod) {
    const clear = hasAIText;
    if (clear && !(await keepAIOrConfirm('Change the reporting period?'))) return;
    rb.setPeriod(next, clear);
  }

  async function reviewGate(): Promise<boolean> {
    const n = rb.unreviewed.length;
    if (!n) return true;
    return ask({
      title: 'The AI text has not been reviewed',
      message: `${n} ${n === 1 ? 'section has' : 'sections have'} AI text nobody has reviewed. Review it before you share this report, or export anyway.`,
      okText: 'Export anyway',
    });
  }

  async function handleDownload(format: ExportFormat) {
    setExportOpen(false);
    if (!(await reviewGate())) return;
    await rb.exportReport('download', format);
  }

  async function handleEmail() {
    setExportOpen(false);
    if (!(await reviewGate())) return;
    setShowEmail(true);
  }

  async function handleNew() {
    setMoreOpen(false);
    const ok = await ask({
      title: 'Start a new report?',
      message: 'This clears the sections, AI text and your saved draft. Report details stay.',
      okText: 'Start new',
    });
    if (ok) await rb.newReport();
  }

  async function handleDeleteTemplate(id: string) {
    const ok = await ask({ title: 'Delete this template?', message: 'This cannot be undone.', okText: 'Delete' });
    if (ok) await rb.deleteTemplate(id);
  }

  const savedAt = rb.draftSavedAt
    ? new Date(rb.draftSavedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="pl-app pl-an-page pl-rb-page">
      <ConfirmModal {...confirmProps} />
      {showSaveTpl && <SaveTemplateModal onSave={(n, d) => void rb.saveTemplate(n, d)} onClose={() => setShowSaveTpl(false)} />}
      {showManage && (
        <ManageTemplatesModal
          templates={savedTemplates}
          canEdit={canPrint}
          onApply={(id) => void changeTemplate(id)}
          onDelete={(id) => void handleDeleteTemplate(id)}
          onSetDefault={(id, type) => void rb.setDefaultTemplate(id, type)}
          onClose={() => setShowManage(false)}
        />
      )}
      {showEmail && (
        <EmailModal
          reportTitle={rb.settings.report_title}
          onSend={(to, cc, subject) => void rb.exportReport('email', 'pdf', { to, cc, subject })}
          onClose={() => setShowEmail(false)}
        />
      )}

      <div className="pl-an-head">
        <div className="pl-stack-xs">
          <h1 className="pl-page-title">Report Builder <Explain id="report-builder" /></h1>
          <p className="pl-intro">
            Pick the sections, check the AI text, then export as PDF or PowerPoint. Every section shows live figures as you add it.
          </p>
        </div>
        <div className="pl-rb-toolbar">
          <div className="pl-field pl-rb-tool">
            <label className="pl-field-label" htmlFor="rb-tpl">Template</label>
            <select id="rb-tpl" className="pl-input" value={templateKnown ? rb.template : ''}
              onChange={(e) => void changeTemplate(e.target.value)}>
              {!templateKnown && <option value="">Your own selection</option>}
              <optgroup label="Built in">
                {BUILTIN_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
              {savedTemplates.length > 0 && (
                <optgroup label="Saved">
                  {savedTemplates.map(t => <option key={t.template_id} value={t.template_id}>{t.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div className="pl-field pl-rb-tool">
            <label className="pl-field-label" htmlFor="rb-per">Period</label>
            <select id="rb-per" className="pl-input" value={rb.period.preset}
              onChange={(e) => void changePeriod({ ...rb.period, preset: e.target.value as PeriodPreset })}>
              {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button type="button" className="pl-btn pl-btn-secondary" disabled={rb.savingDraft || !rb.hydrated}
            onClick={() => void rb.saveDraft()}>
            {rb.savingDraft ? 'Saving…' : 'Save draft'}
          </button>
          <div className="pl-rr-menu-wrap" ref={moreRef}>
            <button type="button" className="pl-btn pl-btn-secondary" aria-label="More report actions"
              aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => { setMoreOpen(o => !o); setExportOpen(false); }}>
              <MoreHorizontal size={18} aria-hidden="true" />
            </button>
            {moreOpen && (
              <div className="pl-menu pl-rr-menu" role="menu" aria-label="More report actions">
                <button type="button" role="menuitem" className="pl-menu-item" onClick={() => void handleNew()}>New report</button>
                {canPrint && (
                  <button type="button" role="menuitem" className="pl-menu-item" onClick={() => { setMoreOpen(false); setShowSaveTpl(true); }}>
                    Save as template
                  </button>
                )}
                <button type="button" role="menuitem" className="pl-menu-item" onClick={() => { setMoreOpen(false); setShowManage(true); }}>
                  Saved templates
                </button>
              </div>
            )}
          </div>
          <div className="pl-rr-menu-wrap" ref={exportRef}>
            <button type="button" className="pl-btn pl-btn-primary" aria-haspopup="menu" aria-expanded={exportOpen}
              disabled={exportBlocked} title={!canPrint ? 'Exporting needs the Print Reports permission' : undefined}
              onClick={() => { setExportOpen(o => !o); setMoreOpen(false); }}>
              {rb.exporting ? 'Working…' : 'Export'}<ChevronDown size={14} aria-hidden="true" />
            </button>
            {exportOpen && (
              <div className="pl-menu pl-rr-menu pl-rb-export" role="menu" aria-label="Export">
                {rb.unreviewed.length > 0 && (
                  <p className="pl-note pl-alert">The AI text has not been reviewed. Review it before you share this report.</p>
                )}
                <button type="button" role="menuitem" className="pl-menu-item" onClick={() => void handleDownload('pdf')}>PDF, A4 report</button>
                <button type="button" role="menuitem" className="pl-menu-item" onClick={() => void handleDownload('pptx')}>PowerPoint deck</button>
                <button type="button" role="menuitem" className="pl-menu-item" onClick={() => void handleEmail()}>Email as PDF</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {rb.period.preset === 'custom' && (
        <div className="pl-rb-custom">
          <div className="pl-field">
            <label className="pl-field-label" htmlFor="rb-from">From</label>
            <input id="rb-from" type="date" className={`pl-input${rb.periodError ? ' invalid' : ''}`} value={rb.period.date_from ?? ''}
              onChange={(e) => void changePeriod({ ...rb.period, date_from: e.target.value || null })} />
          </div>
          <div className="pl-field">
            <label className="pl-field-label" htmlFor="rb-to">To</label>
            <input id="rb-to" type="date" className={`pl-input${rb.periodError ? ' invalid' : ''}`} value={rb.period.date_to ?? ''}
              onChange={(e) => void changePeriod({ ...rb.period, date_to: e.target.value || null })} />
          </div>
          {rb.periodError && <p className="pl-field-error" role="alert">{rb.periodError}</p>}
        </div>
      )}

      <div className="pl-rb-strip" aria-live="polite">
        <span><b className="pl-rb-strong">{rb.activeBlocks.length}</b> {rb.activeBlocks.length === 1 ? 'section' : 'sections'}</span>
        <span aria-hidden="true">·</span>
        <span>{periodText(rb.range)}</span>
        <span aria-hidden="true">·</span>
        <span>AI text <span className={status.cls}>{status.text}</span></span>
        {canAI && aiKeysWithoutText.length > 0 && (
          <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" disabled={busy || !!rb.periodError}
            onClick={() => void rb.generateAI(aiKeysWithoutText)}>
            {rb.generating.length ? 'Writing AI text…' : 'Write AI text'}
          </button>
        )}
        {savedAt && <span className="pl-caption pl-push">Draft saved {savedAt}</span>}
      </div>

      {!rb.hydrated ? (
        <p className="pl-caption" role="status">Loading your report…</p>
      ) : (
        <div className="pl-rb-layout">
          <BlockSelector activeBlocks={rb.activeBlocks} hasIncident={rb.hasIncident} onAdd={rb.addBlock} />
          <BlockCanvas
            activeBlocks={rb.activeBlocks}
            blockData={rb.blockData}
            aiData={rb.aiData}
            aiReviewed={rb.aiReviewed}
            loadingKeys={rb.loadingKeys}
            generating={rb.generating}
            canAI={canAI}
            settings={rb.settings}
            periodText={periodText(rb.range)}
            onMove={rb.moveBlock}
            onRemove={rb.removeBlock}
            onEditNarrative={rb.updateNarrative}
            onReviewed={rb.setReviewed}
            onGenerate={(keys) => void rb.generateAI(keys)}
          />
          <ReportDetails settings={rb.settings} onUpdate={rb.updateSettings} onUpdateSignoff={rb.updateSignoff} />
        </div>
      )}
    </div>
  );
}
