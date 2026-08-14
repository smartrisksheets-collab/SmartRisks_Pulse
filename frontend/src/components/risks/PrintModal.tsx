// src/components/risks/PrintModal.tsx

import { useState } from 'react';
import { useFeedbackStore } from '../../store/feedbackStore';

type PrintScope  = 'all' | 'filtered' | 'single';
type PrintFormat = 'pdf' | 'csv';

interface Props {
  open:    boolean;
  onClose: () => void;
  onGenerate: (scope: PrintScope, format: PrintFormat) => void;
}

export default function PrintModal({ open, onClose, onGenerate }: Props) {
  const [scope,  setScope]  = useState<PrintScope>('all');
  const [format, setFormat] = useState<PrintFormat>('pdf');

  if (!open) return null;

  return (
    <div className="modal-backdrop show" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <h3 className="modal-title">Print Risk Register</h3>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-bd">
          <div className="modal-grid">
            <div className="field col-12">
              <label>Print Scope</label>
              <select value={scope} onChange={e => setScope(e.target.value as PrintScope)}>
                <option value="all">All Risks</option>
                <option value="filtered">Current Filters</option>
                <option value="single">Selected Risk</option>
              </select>
            </div>
            <div className="field col-12">
              <label>Format</label>
              <select value={format} onChange={e => setFormat(e.target.value as PrintFormat)}>
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
              </select>
            </div>
          </div>
          <span className="field-hint" style={{ marginTop: 10 }}>
            Select the scope of risks to include in your report and the desired format.
          </span>
        </div>
        <div className="modal-ft">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => {
            useFeedbackStore.getState().trigger('print_pdf', 'How was the report generation?');
            onGenerate(scope, format);
          }}>
            Generate Report
          </button>
        </div>
      </div>
    </div>
  );
}