// src/components/settings/AppetiteSettings.tsx

import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useLookups } from '../../hooks/useLookups';
import { useAppetite } from '../../hooks/useAppetite';
import { useToast } from '../../hooks/useToast';
import type { AppetiteThresholdUpsert } from '../../types/settings';

interface Draft {
  threshold: number;
  rationale: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AppetiteSettings() {
  const role      = useAuthStore((s) => s.claims?.role);
  const isOwner   = role === 'Owner';
  const toast     = useToast();
  const { lookups }   = useLookups();
  const { query, save } = useAppetite();

  const [openCat,   setOpenCat]   = useState<string | null>(null);
  const [drafts,    setDrafts]    = useState<Record<string, Draft>>({});
  const [savingCat, setSavingCat] = useState<string | null>(null);

  const categories = lookups?.category ?? [];
  const thresholds = query.data ?? [];

  function getRecord(cat: string) {
    return thresholds.find((t) => t.category === cat) ?? null;
  }

  function handleEdit(cat: string) {
    if (openCat === cat) { setOpenCat(null); return; }
    const rec = getRecord(cat);
    setDrafts((prev) => ({
      ...prev,
      [cat]: { threshold: rec?.threshold ?? 12, rationale: rec?.rationale ?? '' },
    }));
    setOpenCat(cat);
  }

  function handleCancel(cat: string) {
    setOpenCat(null);
    setDrafts((prev) => { const n = { ...prev }; delete n[cat]; return n; });
  }

  async function handleSave(cat: string) {
    const draft = drafts[cat];
    if (!draft) return;
    const payload: AppetiteThresholdUpsert = {
      category:  cat,
      threshold: draft.threshold,
      rationale: draft.rationale.trim() || undefined,
    };
    setSavingCat(cat);
    try {
      await save.mutateAsync(payload);
      toast(`Threshold saved for ${cat}.`, 'success');
      setOpenCat(null);
    } catch {
      toast('Save failed. Please try again.', 'error');
    } finally {
      setSavingCat(null);
    }
  }

  return (
    <div>
      <div className="settings-section">
        <div className="settings-title">Risk Appetite Thresholds</div>
        <p className="muted small">
          Set the maximum residual risk each category is permitted to carry, on your workspace&apos;s 1&ndash;25 risk scale.
        </p>
      </div>

      {query.isLoading && <p className="muted small" style={{ paddingTop: 16 }}>Loading&hellip;</p>}

      {categories.map((cat) => {
        const rec      = getRecord(cat);
        const isOpen   = openCat === cat;
        const draft    = drafts[cat];
        const isSaving = savingCat === cat;

        return (
          <div className="apt-row" key={cat}>
            <div className="apt-row-head">
              <div>
                <div className="apt-cat-name">{cat}</div>
                {rec && (
                  <div className="apt-meta">
                    Set by {rec.set_by ?? 'unknown'} &middot; {fmtDate(rec.set_at)}
                  </div>
                )}
              </div>
              <div className="apt-right">
                <div className="apt-value">
                  {rec != null
                    ? <>{rec.threshold}<span className="apt-value-max">/25</span></>
                    : <span className="apt-meta">Not set</span>
                  }
                </div>
                {isOwner && (
                  <button
                    type="button"
                    className="btn apt-edit-btn"
                    onClick={() => handleEdit(cat)}
                  >
                    {isOpen ? 'Close' : 'Edit'}
                  </button>
                )}
              </div>
            </div>

            {isOpen && draft && (
              <div className="apt-panel">
                <div className="apt-slider-row">
                  <input
                    type="range"
                    min={1}
                    max={25}
                    value={draft.threshold}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [cat]: { ...prev[cat], threshold: Number(e.target.value) },
                      }))
                    }
                  />
                  <div className="apt-slider-val">{draft.threshold}</div>
                </div>
                <div className="field">
                  <label>Rationale</label>
                  <textarea
                    placeholder="e.g. Aligned to Q3 board risk appetite statement"
                    value={draft.rationale}
                    style={{ minHeight: 44 }}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [cat]: { ...prev[cat], rationale: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="apt-panel-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={isSaving}
                    onClick={() => handleCancel(cat)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={isSaving}
                    onClick={() => void handleSave(cat)}
                  >
                    {isSaving ? 'Saving\u2026' : 'Save threshold'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}