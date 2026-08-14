// src/components/incidents/IncidentPrintModal.tsx

import { useState } from 'react';
import { Info } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export default function IncidentPrintModal({ onClose }: Props) {
  const [scope, setScope]   = useState<'selected' | 'all' | 'executive'>('all');
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');

  const isExecutive = scope === 'executive';

  return (
    <div className="modal-backdrop show">
      <div className="modal">
        <div className="modal-hd">
          <h3 className="modal-title">Print Incident Report</h3>
          <button className="x" onClick={onClose} type="button">✕</button>
        </div>
        <div className="modal-bd">
          <div className="field">
            <label>Report Type</label>
            <select
              className="form-control"
              value={scope}
              onChange={e => setScope(e.target.value as typeof scope)}
            >
              <option value="selected">Selected Incidents</option>
              <option value="all">All Incidents</option>
              <option value="executive">Executive Report (PDF Only)</option>
            </select>
          </div>

          {!isExecutive && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>Format</label>
              <select
                className="form-control"
                value={format}
                onChange={e => setFormat(e.target.value as typeof format)}
              >
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
              </select>
            </div>
          )}

          {isExecutive && (
            <div style={{ marginTop: 12, padding: '12px', background: '#f8f9fa', borderLeft: '3px solid #1F2854', borderRadius: 4 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Info size={18} color="#1F2854" style={{ marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Executive Report</div>
                  <div className="muted small">Aggregated, read-only report formatted for leadership. Includes summary statistics, high-severity incidents, and key trends. PDF format only.</div>
                </div>
              </div>
            </div>
          )}

          <p className="muted small" style={{ marginTop: 10 }}>
            Select the scope of incidents to include and the desired format.
          </p>
        </div>
        <div className="modal-ft">
          <button className="btn btn-secondary" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary" type="button" onClick={onClose}>
            Generate Report
          </button>
        </div>
      </div>
    </div>
  );
}