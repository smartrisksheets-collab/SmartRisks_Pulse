// src/components/reports/ReportModals.tsx
// Report Builder dialogs (UI step 7): confirm, save template, manage templates, email.

import { useState } from 'react';
import type { ConfirmRequest } from '../../hooks/useConfirm';
import type { ReportTemplate } from '../../types/report';
import { validateEmail, parseCcList, validateCcList, MAX_CC } from '../../utils/validation';

// ── Confirm ────────────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  request: ConfirmRequest | null;
  onClose: (ok: boolean) => void;
}

export function ConfirmModal({ request, onClose }: ConfirmModalProps) {
  if (!request) return null;
  return (
    <div className="srs-confirm-backdrop pl-app" role="presentation">
      <div className="srs-confirm" role="alertdialog" aria-modal="true" aria-labelledby="rb-confirm-title">
        <h2 id="rb-confirm-title" className="pl-item-title">{request.title}</h2>
        <p className="pl-p pl-rb-confirm-msg">{request.message}</p>
        <div className="srs-confirm-ft">
          <button type="button" className="pl-btn pl-btn-secondary" onClick={() => onClose(false)}>Cancel</button>
          <button type="button" className="pl-btn pl-btn-primary" autoFocus onClick={() => onClose(true)}>
            {request.okText ?? 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Save template ──────────────────────────────────────────────────────────────

interface SaveTemplateModalProps {
  onSave:  (name: string, description: string) => void;
  onClose: () => void;
}

export function SaveTemplateModal({ onSave, onClose }: SaveTemplateModalProps) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [err,  setErr]  = useState('');
  const check = (v: string) => (v.trim().length < 2 ? 'Give the template a name of at least 2 characters.' : '');
  return (
    <div className="modal-backdrop show pl-app" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal pl-rb-modal-s" role="dialog" aria-modal="true" aria-labelledby="rb-save-tpl">
        <div className="modal-hd">
          <h2 id="rb-save-tpl" className="modal-title">Save as template</h2>
          <button type="button" className="pl-icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-bd pl-stack">
          <p className="pl-body-s">Saves the sections and report details, not the figures or AI text.</p>
          <div className="pl-field">
            <label className="pl-field-label" htmlFor="rb-tpl-name">Template name <span className="pl-req">*</span></label>
            <input id="rb-tpl-name" className={`pl-input${err ? ' invalid' : ''}`} value={name} maxLength={255}
              onChange={(e) => { setName(e.target.value); if (err) setErr(''); }}
              onBlur={(e) => setErr(check(e.target.value))} placeholder="Board risk pack" autoFocus />
            {err && <p className="pl-field-error">{err}</p>}
          </div>
          <div className="pl-field">
            <label className="pl-field-label" htmlFor="rb-tpl-desc">Description <span className="pl-opt">(optional)</span></label>
            <textarea id="rb-tpl-desc" className="pl-input" value={desc} maxLength={1000}
              onChange={(e) => setDesc(e.target.value)} placeholder="What is this template used for?" />
          </div>
        </div>
        <div className="modal-ft">
          <button type="button" className="pl-btn pl-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="pl-btn pl-btn-primary" onClick={() => {
            const e = check(name);
            setErr(e);
            if (e) return;
            onSave(name.trim(), desc.trim());
            onClose();
          }}>Save template</button>
        </div>
      </div>
    </div>
  );
}

// ── Manage templates ───────────────────────────────────────────────────────────

interface ManageTemplatesModalProps {
  templates:    ReportTemplate[];
  canEdit:      boolean;
  onApply:      (id: string) => void;
  onDelete:     (id: string) => void;
  onSetDefault: (id: string, reportType: string) => void;
  onClose:      () => void;
}

export function ManageTemplatesModal({ templates, canEdit, onApply, onDelete, onSetDefault, onClose }: ManageTemplatesModalProps) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const rows = templates.filter(t => !q || t.name.toLowerCase().includes(q));
  return (
    <div className="modal-backdrop show pl-app" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal pl-rb-modal-l" role="dialog" aria-modal="true" aria-labelledby="rb-manage-tpl">
        <div className="modal-hd">
          <h2 id="rb-manage-tpl" className="modal-title">Saved templates</h2>
          <button type="button" className="pl-icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-bd pl-stack">
          <input className="pl-input" aria-label="Search templates" placeholder="Search templates"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          {!rows.length && <p className="pl-body-s">{q ? 'No template matches your search.' : 'No saved templates yet.'}</p>}
          {rows.length > 0 && (
            <div className="pl-table-wrap">
              <table className="pl-table pl-compact pl-rb-tpl-table">
                <thead>
                  <tr><th>Template</th><th>Sections</th><th>Updated</th><th>Created by</th><th><span className="pl-rb-sr">Actions</span></th></tr>
                </thead>
                <tbody>
                  {rows.map(t => (
                    <tr key={t.template_id}>
                      <td>
                        <div className="pl-stack-xs">
                          <span>{t.name}{t.is_default && <span className="pl-chip pl-ok pl-rb-chip-gap">Default</span>}</span>
                          {t.description && <span className="pl-caption">{t.description}</span>}
                        </div>
                      </td>
                      <td>{t.blocks.length}</td>
                      <td className="pl-in-nowrap">{t.updated_at ? new Date(t.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</td>
                      <td>{t.created_by}</td>
                      <td>
                        <div className="pl-inline">
                          <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" onClick={() => { onApply(t.template_id); onClose(); }}>Use</button>
                          {canEdit && !t.is_default && (
                            <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => onSetDefault(t.template_id, t.report_type)}>Make default</button>
                          )}
                          {canEdit && (
                            <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm pl-rr-danger" onClick={() => onDelete(t.template_id)}>Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-ft">
          <button type="button" className="pl-btn pl-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Email ──────────────────────────────────────────────────────────────────────

interface EmailModalProps {
  reportTitle: string;
  onSend:      (to: string, cc: string[], subject: string) => void;
  onClose:     () => void;
}

export function EmailModal({ reportTitle, onSend, onClose }: EmailModalProps) {
  const [to,      setTo]      = useState('');
  const [cc,      setCc]      = useState('');
  const [subject, setSubject] = useState(reportTitle || 'SmartRisk Report');
  const [err,     setErr]     = useState('');
  const [ccErr,   setCcErr]   = useState('');
  return (
    <div className="modal-backdrop show pl-app" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal pl-rb-modal-s" role="dialog" aria-modal="true" aria-labelledby="rb-email">
        <div className="modal-hd">
          <h2 id="rb-email" className="modal-title">Email the report</h2>
          <button type="button" className="pl-icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-bd pl-stack">
          <p className="pl-body-s">Sends the PDF as an attachment.</p>
          <div className="pl-field">
            <label className="pl-field-label" htmlFor="rb-to">To <span className="pl-req">*</span></label>
            <input id="rb-to" type="email" className={`pl-input${err ? ' invalid' : ''}`} value={to} autoFocus
              onChange={(e) => { setTo(e.target.value); if (err) setErr(''); }}
              onBlur={(e) => setErr(validateEmail(e.target.value.trim()))} placeholder="name@company.com" />
            {err && <p className="pl-field-error">{err}</p>}
          </div>
          <div className="pl-field">
            <label className="pl-field-label" htmlFor="rb-cc">CC <span className="pl-opt">(optional)</span></label>
            <input id="rb-cc" className={`pl-input${ccErr ? ' invalid' : ''}`} value={cc}
              onChange={(e) => { setCc(e.target.value); if (ccErr) setCcErr(''); }}
              onBlur={(e) => setCcErr(validateCcList(parseCcList(e.target.value), to))}
              placeholder="name@company.com, other@company.com" />
            {ccErr
              ? <p className="pl-field-error">{ccErr}</p>
              : <span className="pl-help">Up to {MAX_CC} addresses, separated by commas.</span>}
          </div>
          <div className="pl-field">
            <label className="pl-field-label" htmlFor="rb-subject">Subject</label>
            <input id="rb-subject" className="pl-input" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
          </div>
        </div>
        <div className="modal-ft">
          <button type="button" className="pl-btn pl-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="pl-btn pl-btn-primary" onClick={() => {
            const toMsg  = validateEmail(to.trim());
            const ccList = parseCcList(cc);
            const ccMsg  = validateCcList(ccList, to);
            setErr(toMsg);
            setCcErr(ccMsg);
            if (toMsg || ccMsg) return;
            onSend(to.trim(), ccList, subject.trim());
            onClose();
          }}>Send</button>
        </div>
      </div>
    </div>
  );
}
