// src/components/settings/ControlEffectivenessSettings.tsx

import { useState } from 'react';
import { useMatrix, useSaveCeConfig } from '../../hooks/useMatrix';
import { previewCeScale } from '../../services/matrix';
import UnsavedBanner from './UnsavedBanner';
import type { CeScalePreview } from '../../types/matrix';
import { CE_LABEL_MAX, CE_SCALE_OPTIONS, ceLevelKeys } from '../../types/matrix';

export default function ControlEffectivenessSettings() {
  const { query } = useMatrix();
  const saveCe = useSaveCeConfig();
  const [scale, setScale]             = useState(5);
  const [labels, setLabels]           = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  const [preview, setPreview]         = useState<CeScalePreview | null>(null);
  const [checking, setChecking]       = useState(false);
  const [msg, setMsg]                 = useState('');
  const [err, setErr]                 = useState('');

  if (query.data && !initialized) {
    setScale(query.data.ce_scale);
    setLabels({ ...query.data.ce_labels });
    setInitialized(true);
  }

  if (query.isLoading) return <p className="muted small">Loading…</p>;
  if (query.isError || !query.data) {
    return <div className="mx-warn visible">Failed to load control effectiveness settings.</div>;
  }

  const saved = query.data;
  const keys  = ceLevelKeys(scale);
  const busy  = saveCe.isPending || checking;
  const isDirty =
    scale !== saved.ce_scale ||
    keys.some((k) => (labels[k] ?? '') !== (saved.ce_labels[k] ?? ''));

  function changeScale(next: number) {
    setScale(next);
    setLabels((prev) => {
      const out: Record<string, string> = {};
      for (const k of ceLevelKeys(next)) out[k] = prev[k] ?? saved.ce_labels[k] ?? '';
      return out;
    });
  }

  function doSave(confirm: boolean) {
    setMsg('');
    setErr('');
    const payload: Record<string, string> = {};
    for (const k of keys) payload[k] = labels[k] ?? '';
    saveCe.mutate(
      { ce_scale: scale, ce_labels: payload, confirm },
      {
        onSuccess: (data) => {
          setPreview(null);
          setScale(data.ce_scale);
          setLabels({ ...data.ce_labels });
          setMsg('Control effectiveness settings saved.');
        },
        onError: (e) => {
          setPreview(null);
          setErr(e instanceof Error ? e.message : 'Save failed.');
        },
      },
    );
  }

  async function handleSave() {
    if (scale === saved.ce_scale) {
      doSave(false);
      return;
    }
    setChecking(true);
    setErr('');
    try {
      setPreview(await previewCeScale(scale));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not check affected risks.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="settings-section">
      {isDirty && <UnsavedBanner onSave={() => { void handleSave(); }} saving={busy} />}

      <div className="settings-title">Control Effectiveness</div>
      <p className="mx-card-desc">
        How strongly each control rating reduces inherent risk. Residual = Severity × (1 − level ÷ scale).
      </p>

      <div className="mx-card-header">
        <span className="mx-card-num">1</span>
        <span className="mx-card-title">Rating scale</span>
      </div>
      <div className="mx-presets">
        {CE_SCALE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`mx-chip${scale === o.value ? ' active' : ''}`}
            disabled={!saved.ce_scale_switch_enabled && o.value !== saved.ce_scale}
            onClick={() => changeScale(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {!saved.ce_scale_switch_enabled && (
        <p className="mx-band-note">The scale is fixed at {saved.ce_scale} levels for now. Labels can be edited.</p>
      )}

      <div className="mx-card-header" style={{ marginTop: 18 }}>
        <span className="mx-card-num">2</span>
        <span className="mx-card-title">Level labels</span>
      </div>
      <p className="mx-card-desc">Shown in forms, tables and imports. A blank label falls back to the level number.</p>
      <div className="mx-bands">
        <div className="mx-band-row ce-label-row">
          <span className="mx-band-note">Blank</span>
          <span className="muted small">Not assessed (fixed)</span>
        </div>
        {keys.map((k) => (
          <div key={k} className="mx-band-row ce-label-row">
            <span className="mx-band-note">Level {k}</span>
            <div className="field">
              <input
                value={labels[k] ?? ''}
                maxLength={CE_LABEL_MAX}
                placeholder={k}
                onChange={(e) => setLabels((l) => ({ ...l, [k]: e.target.value }))}
              />
            </div>
          </div>
        ))}
      </div>

      {err && <div className="mx-warn visible">{err}</div>}
      {msg && <p className="ce-ok">{msg}</p>}

      <div className="settings-actions">
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => { void handleSave(); }}
          disabled={!isDirty || busy}
        >
          {busy ? 'Saving…' : 'Save Control Effectiveness'}
        </button>
      </div>

      {preview && (
        <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && setPreview(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-hd">
              <h3 className="modal-title">Change rating scale</h3>
            </div>
            <div className="modal-bd">
              {preview.blocked_count > 0 ? (
                <>
                  <div className="mx-warn visible">
                    {preview.blocked_count} risk(s) are rated above {preview.target_scale}. Re-rate them before switching.
                  </div>
                  <ul className="ce-blocked-list">
                    {preview.blocked_risks.map((r) => (
                      <li key={r.risk_id}>
                        <strong>{r.risk_id}</strong> rated {r.control_effectiveness}: {r.description}
                      </li>
                    ))}
                  </ul>
                  {preview.blocked_count > preview.blocked_risks.length && (
                    <p className="muted small">
                      and {preview.blocked_count - preview.blocked_risks.length} more.
                    </p>
                  )}
                </>
              ) : (
                <p className="muted small">
                  Switching from {preview.current_scale} to {preview.target_scale} levels recalculates the residual
                  for {preview.affected_count} risk(s). Past snapshots and reports are not changed.
                </p>
              )}
            </div>
            <div className="modal-ft">
              <button className="btn btn-secondary" type="button" onClick={() => setPreview(null)}>Cancel</button>
              {preview.blocked_count === 0 && (
                <button className="btn btn-primary" type="button" onClick={() => doSave(true)} disabled={saveCe.isPending}>
                  {saveCe.isPending ? 'Saving…' : 'Confirm and recalculate'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}