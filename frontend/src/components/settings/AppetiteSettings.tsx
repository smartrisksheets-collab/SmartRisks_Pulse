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

// ── Guide panel ───────────────────────────────────────────────────────────────

function GuidePanel({ unsetCount, total }: { unsetCount: number; total: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="apt-guide">
      <button
        type="button"
        className={`apt-guide-head${open ? ' open' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        <div className="apt-guide-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div className="apt-guide-txt">
          <strong>New here? Turn your written risk policy into numbers</strong>
          <span>A 5-step method for translating your RMF or Risk Appetite Statement into thresholds below</span>
        </div>
        <svg
          className={`apt-guide-chev${open ? ' open' : ''}`}
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="apt-guide-body">
          <div className="apt-guide-notice">
            <div className="apt-guide-notice-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div>
              <strong>These thresholds cap residual risk, not inherent risk</strong>
              <p>Every number below is checked against a risk&apos;s <span className="apt-guide-hl">residual</span> score, the score after control effectiveness is applied, not its raw inherent score.</p>
              <p>A control with no logged evidence deducts nothing, so its risk&apos;s residual equals inherent until tested. A breach can mean a genuinely under-controlled risk, or simply an untested control. Check control evidence before treating a breach as a new danger.</p>
            </div>
          </div>

          {[
            {
              n: 1,
              title: 'Confirm your bands match this scale',
              body: 'Your policy may define its own Low / Medium / High ranges on the 1–25 scale. If it does, use those. If it doesn\'t, the SmartRisk default is your starting point. Check the Risk Matrix tab to see what\'s currently configured for this workspace.',
              table: null,
            },
            {
              n: 2,
              title: 'Anchor each qualitative appetite level near the bottom of its band',
              body: 'A threshold is a ceiling. Set it low within the band it names, not at the edge closest to the next band — a ceiling at the edge behaves like no ceiling at all.',
              table: [
                ['Zero tolerance / Very Low', '2 – 3'],
                ['Low', '5 – 7'],
                ['Low–Moderate', '8 – 10'],
                ['Moderate (within limits)', '12 – 14'],
              ],
            },
            {
              n: 3,
              title: 'Map your policy\'s categories to the ones below, explicitly',
              body: 'Your policy almost certainly uses different category names than the ones in this list. Write the mapping down before setting any threshold, especially where one category here might need to represent several distinct items in your policy.',
              table: null,
            },
            {
              n: 4,
              title: 'Set the threshold and record why',
              body: 'Use the rationale field on each threshold to cite the policy language it\'s based on and who approved it. Appetite thresholds are typically a Board-level decision — a number set without that approval isn\'t a substitute for it.',
              table: null,
            },
            {
              n: 5,
              title: 'Leave it "Not set" if your policy is silent — don\'t guess',
              body: 'A category your policy doesn\'t address should stay Not set. That\'s a visible, honest gap — and a finding to raise with whoever owns the policy, not something to quietly resolve with an invented number.',
              table: null,
            },
          ].map((step) => (
            <div key={step.n} className="apt-guide-step">
              <div className="apt-guide-num">{step.n}</div>
              <div className="apt-guide-step-body">
                <strong>{step.title}</strong>
                <p>{step.body}</p>
                {step.table && (
                  <table className="apt-guide-table">
                    <thead>
                      <tr><th>Your policy says</th><th>Suggested ceiling</th></tr>
                    </thead>
                    <tbody>
                      {step.table.map(([label, val]) => (
                        <tr key={label}>
                          <td>{label}</td>
                          <td><span className="apt-guide-pill">{val}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {step.n === 5 && unsetCount > 0 && (
                  <div className="apt-guide-warn">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div>
                      <strong>{unsetCount} of {total} {unsetCount === 1 ? 'category' : 'categories'} below {unsetCount === 1 ? 'is' : 'are'} Not set.</strong> If your policy addresses any of these, that language should be translated using Steps 1–4 before assuming the gap is intentional.
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({
  category,
  onConfirm,
  onClose,
  loading,
}: {
  category: string
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  return (
    <div className="modal-backdrop show" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-hd">
          <h3 className="modal-title">Remove Threshold</h3>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-bd">
          <p className="muted small" style={{ marginBottom: 14 }}>
            This will permanently remove the appetite threshold for <strong>{category}</strong>. The category remains in your risk register, but it will no longer have a set ceiling. This action cannot be undone.
          </p>
          <div className="modal-grid">
            <div className="field col-12">
              <label>Category</label>
              <input value={category} readOnly />
            </div>
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading && <span className="spinner" />}
            Remove threshold
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AppetiteSettings() {
  const role    = useAuthStore((s) => s.claims?.role);
  const isOwner = role === 'Owner';
  const toast   = useToast();

  const { lookups }         = useLookups();
  const { query, save, remove } = useAppetite();

  const [openCat,    setOpenCat]    = useState<string | null>(null);
  const [drafts,     setDrafts]     = useState<Record<string, Draft>>({});
  const [savingCat,  setSavingCat]  = useState<string | null>(null);
  const [deleteCat,  setDeleteCat]  = useState<string | null>(null);

  const categories = lookups?.category ?? [];
  const thresholds = query.data ?? [];

  const unsetCount = categories.filter(
    (cat) => !thresholds.find((t) => t.category === cat)
  ).length;

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

  async function handleDelete() {
    if (!deleteCat) return;
    try {
      await remove.mutateAsync(deleteCat);
      toast(`Threshold removed for ${deleteCat}.`, 'success');
      setDeleteCat(null);
    } catch {
      toast('Remove failed. Please try again.', 'error');
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

      <GuidePanel unsetCount={unsetCount} total={categories.length} />

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
                {rec
                  ? <div className="apt-meta">Set by {rec.set_by ?? 'unknown'} &middot; {fmtDate(rec.set_at)}</div>
                  : <div className="apt-meta">Not set</div>
                }
              </div>
              <div className="apt-right">
                <div className="apt-value">
                  {rec != null
                    ? <>{rec.threshold}<span className="apt-value-max">/25</span></>
                    : <span className="apt-meta" style={{ fontStyle: 'italic' }}>—</span>
                  }
                </div>
                {isOwner && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn apt-edit-btn"
                      onClick={() => handleEdit(cat)}
                    >
                      {isOpen ? 'Close' : rec ? 'Edit' : 'Set'}
                    </button>
                    {rec && (
                      <button
                        type="button"
                        className="btn apt-del-btn"
                        onClick={() => setDeleteCat(cat)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
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
                  <button type="button" className="btn btn-secondary" disabled={isSaving} onClick={() => handleCancel(cat)}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary" disabled={isSaving} onClick={() => void handleSave(cat)}>
                    {isSaving ? 'Saving\u2026' : 'Save threshold'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {deleteCat && (
        <DeleteConfirmModal
          category={deleteCat}
          onConfirm={() => void handleDelete()}
          onClose={() => setDeleteCat(null)}
          loading={remove.isPending}
        />
      )}
    </div>
  );
}