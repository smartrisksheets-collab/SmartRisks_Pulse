// src/components/reports/ReportDetails.tsx
// Report details panel (UI step 7): cover and sign-off fields, footer, page numbers.

import type { ReportSettings } from '../../types/report';
import { FOOTER_OPTIONS } from '../../utils/reportPresets';

interface Props {
  settings:        ReportSettings;
  onUpdate:        (p: Partial<ReportSettings>) => void;
  onUpdateSignoff: (p: Partial<ReportSettings['signoff']>) => void;
}

export default function ReportDetails({ settings, onUpdate, onUpdateSignoff }: Props) {
  const so = settings.signoff;
  // A footer typed before the list existed stays selectable.
  const footers = FOOTER_OPTIONS.includes(settings.footer_text) || !settings.footer_text
    ? FOOTER_OPTIONS
    : [settings.footer_text, ...FOOTER_OPTIONS];
  return (
    <aside className="pl-card pl-rb-details" aria-label="Report details">
      <h2 className="pl-label">Report details</h2>
      <div className="pl-field">
        <label className="pl-field-label" htmlFor="rs-title">Title</label>
        <input id="rs-title" className="pl-input" value={settings.report_title} maxLength={200}
          onChange={(e) => onUpdate({ report_title: e.target.value })} placeholder="Enterprise Risk Report" />
      </div>
      <div className="pl-field">
        <label className="pl-field-label" htmlFor="rs-for">Prepared for</label>
        <input id="rs-for" className="pl-input" value={settings.prepared_for} maxLength={200}
          onChange={(e) => onUpdate({ prepared_for: e.target.value })} placeholder="Executive Management" />
      </div>
      <div className="pl-field">
        <label className="pl-field-label" htmlFor="rs-dist">Distribution</label>
        <input id="rs-dist" className="pl-input" value={settings.distribution} maxLength={200}
          onChange={(e) => onUpdate({ distribution: e.target.value })} placeholder="Board, Senior Management" />
      </div>
      <div className="pl-rb-pair">
        <div className="pl-field">
          <label className="pl-field-label" htmlFor="rs-ref">Reference</label>
          <input id="rs-ref" className="pl-input" value={settings.report_ref} maxLength={60}
            onChange={(e) => onUpdate({ report_ref: e.target.value })} placeholder="SR-2026-11" />
        </div>
        <div className="pl-field">
          <label className="pl-field-label" htmlFor="rs-ver">Version</label>
          <input id="rs-ver" className="pl-input" value={settings.version} maxLength={20}
            onChange={(e) => onUpdate({ version: e.target.value })} placeholder="v1.0" />
        </div>
      </div>
      <div className="pl-field">
        <label className="pl-field-label" htmlFor="rs-foot">Footer</label>
        <select id="rs-foot" className="pl-input" value={settings.footer_text || 'Confidential'}
          onChange={(e) => onUpdate({ footer_text: e.target.value })}>
          {footers.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <label className="pl-rb-check">
        <input type="checkbox" checked={settings.cover_page !== 'No'}
          onChange={(e) => onUpdate({ cover_page: e.target.checked ? 'Yes' : 'No' })} />
        Include a cover page
      </label>
      <label className="pl-rb-check">
        <input type="checkbox" checked={settings.page_numbering !== 'Hide'}
          onChange={(e) => onUpdate({ page_numbering: e.target.checked ? 'Show' : 'Hide' })} />
        Number the pages
      </label>

      <h2 className="pl-label pl-rb-details-sub">Sign-off</h2>
      <label className="pl-rb-check">
        <input type="checkbox" checked={so.include} onChange={(e) => onUpdateSignoff({ include: e.target.checked })} />
        Include a sign-off section
      </label>
      <div className="pl-rb-pair">
        <div className="pl-field">
          <label className="pl-field-label" htmlFor="rs-by">Prepared by</label>
          <input id="rs-by" className="pl-input" value={so.prepared_by} maxLength={120}
            onChange={(e) => onUpdateSignoff({ prepared_by: e.target.value })} placeholder="Name" />
        </div>
        <div className="pl-field">
          <label className="pl-field-label" htmlFor="rs-by-role">Role</label>
          <input id="rs-by-role" className="pl-input" value={so.prepared_title} maxLength={120}
            onChange={(e) => onUpdateSignoff({ prepared_title: e.target.value })} placeholder="Risk Lead" />
        </div>
      </div>
      <div className="pl-rb-pair">
        <div className="pl-field">
          <label className="pl-field-label" htmlFor="rs-ap">Approved by</label>
          <input id="rs-ap" className="pl-input" value={so.approved_by} maxLength={120}
            onChange={(e) => onUpdateSignoff({ approved_by: e.target.value })} placeholder="Name" />
        </div>
        <div className="pl-field">
          <label className="pl-field-label" htmlFor="rs-ap-role">Role</label>
          <input id="rs-ap-role" className="pl-input" value={so.approved_title} maxLength={120}
            onChange={(e) => onUpdateSignoff({ approved_title: e.target.value })} placeholder="Chief Risk Officer" />
        </div>
      </div>
    </aside>
  );
}
