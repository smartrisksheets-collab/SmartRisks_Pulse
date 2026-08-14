// src/components/risks/AIModal.tsx

import { useState } from 'react';
import type { AIInsightResult } from '../../types/risk';
import { useFeedbackStore } from '../../store/feedbackStore';

type UITarget = 'new' | 'filtered' | 'selected';

const TARGET_HINTS: Record<UITarget, string> = {
  new:      'Risks with no existing AI insight.',
  filtered: 'All risks matching your current filters.',
  selected: 'Only the risks you have checked.',
};

interface Props {
  open:          boolean;
  onClose:       () => void;
  selectedCount: number;
  filteredCount: number;
  onGenerate:    (opts: { uiTarget: UITarget; notes?: string; overwrite: boolean }) => Promise<AIInsightResult | null>;
}

export default function AIModal({ open, onClose, onGenerate, selectedCount, filteredCount }: Props) {
  const [target, setTarget]   = useState<UITarget>('new');
  const [notes, setNotes]     = useState('');
  const [overwrite, setOverwrite]   = useState(false);
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<AIInsightResult | null>(null);
  const [error, setError]           = useState<string | null>(null);

  if (!open) return null;

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const r = await onGenerate({ uiTarget: target, notes: notes || undefined, overwrite });
      if (r) {
        setResult(r);
        useFeedbackStore.getState().trigger('ai_insights', 'How were the AI insights?');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() { setResult(null); setError(null); onClose(); }

  return (
    <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-hd">
          <h3 className="modal-title">Generate AI Insights</h3>
          <button className="x" onClick={handleClose}>✕</button>
        </div>
        <div className="modal-bd">
          {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}

          {result ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ fontSize: 32, fontWeight: 900, color: '#01b88e' }}>{result.updated}</p>
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>risks updated with AI insights</p>
              {result.skipped > 0 && <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>{result.skipped} skipped</p>}
              {result.failed > 0 && <p style={{ fontSize: 13, color: '#dc2626', marginTop: 4 }}>{result.failed} failed</p>}
            </div>
          ) : (
            <div className="modal-grid">
              <div className="field col-12">
                <label>Target</label>
                <select value={target} onChange={e => setTarget(e.target.value as UITarget)}>
                  <option value="new">New Risks</option>
                  <option value="filtered">Filtered Risks ({filteredCount})</option>
                  <option value="selected" disabled={selectedCount === 0}>
                    Selected Risks{selectedCount > 0 ? ` (${selectedCount})` : ' — none checked'}
                  </option>
                </select>
                <span className="field-hint">{TARGET_HINTS[target]}</span>
              </div>
              <div className="field col-12">
                <label>Additional notes (optional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Any context to guide the AI..." style={{ minHeight: 70 }} />
              </div>
              <div className="col-12" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="overwrite" checked={overwrite}
                  onChange={e => setOverwrite(e.target.checked)} />
                <label htmlFor="overwrite" style={{ fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>
                  Overwrite existing insights
                </label>
              </div>
            </div>
          )}
        </div>
        <div className="modal-ft">
          <button className="btn btn-secondary" onClick={handleClose}>{result ? 'Close' : 'Cancel'}</button>
          {!result && (
            <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
              {loading && <span className="spinner" />}
              {loading ? 'Generating...' : 'Generate Insights'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}