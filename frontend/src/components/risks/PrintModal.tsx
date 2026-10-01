// src/components/risks/PrintModal.tsx

import { useState } from 'react';
import { useFeedbackStore } from '../../store/feedbackStore';
import { useAuthStore } from '../../store/authStore';
import { EXPORT_COLUMNS, loadExportColumns, saveExportColumns } from '../../utils/riskExport';
import type { ExportScope } from '../../utils/riskExport';

interface Props {
  open:          boolean;
  selectedCount: number;
  onClose:       () => void;
  onGenerate:    (scope: ExportScope, columns: string[]) => void;
}

export default function PrintModal({ open, selectedCount, onClose, onGenerate }: Props) {
  const tenantId = useAuthStore(s => s.claims?.active_tenant_id ?? null);
  const [scope,   setScope]   = useState<ExportScope>('all');
  const [columns, setColumns] = useState<string[]>(() => loadExportColumns(tenantId));

  if (!open) return null;

  const canGenerate = columns.length > 0 && (scope !== 'selected' || selectedCount > 0);

  function toggle(key: string) {
    setColumns(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  }

  function generate() {
    saveExportColumns(tenantId, columns);
    useFeedbackStore.getState().trigger('print_pdf', 'How was the export?');
    onGenerate(scope, columns);
  }

  return (
    <div className="modal-backdrop show" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <h3 className="modal-title">Export Risk Register</h3>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-bd">
          <div className="modal-grid">
            <div className="field col-12">
              <label>Scope</label>
              <select value={scope} onChange={e => setScope(e.target.value as ExportScope)}>
                <option value="all">All risks</option>
                <option value="filtered">Current filters</option>
                <option value="selected" disabled={selectedCount === 0}>Selected risks ({selectedCount})</option>
              </select>
            </div>
            <div className="col-12">
              <div className="exp-cols-head">
                <span className="exp-cols-title">Columns ({columns.length} of {EXPORT_COLUMNS.length})</span>
                <div className="exp-cols-actions">
                  <button type="button" className="btn btn-secondary btn-compact" onClick={() => setColumns(EXPORT_COLUMNS.map(c => c.key))}>Select all</button>
                  <button type="button" className="btn btn-secondary btn-compact" onClick={() => setColumns([])}>Clear</button>
                </div>
              </div>
              <div className="exp-cols">
                {EXPORT_COLUMNS.map(c => (
                  <label key={c.key} className="exp-col">
                    <input type="checkbox" checked={columns.includes(c.key)} onChange={() => toggle(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <span className="field-hint" style={{ marginTop: 10 }}>
            Exports as CSV. Your column choice is remembered for this workspace.
          </span>
        </div>
        <div className="modal-ft">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={generate} disabled={!canGenerate}>Export CSV</button>
        </div>
      </div>
    </div>
  );
}