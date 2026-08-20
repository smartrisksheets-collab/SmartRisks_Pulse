// src/components/settings/MatrixSettings.tsx

import { useState, useMemo } from 'react';
import { useMatrix } from '../../hooks/useMatrix';
import UnsavedBanner from './UnsavedBanner';
import type { MatrixConfigUpdate } from '../../types/matrix';
import { MATRIX_DEFAULTS } from '../../types/matrix';

// ── Module-level constants ──────────────────────────────────────────────────

function detectPreset(data: MatrixConfigUpdate): string {
  for (const [name, preset] of Object.entries(PRESETS)) {
    if ((Object.keys(preset) as (keyof MatrixConfigUpdate)[]).every(k => data[k] === preset[k])) {
      return name;
    }
  }
  return 'custom';
}

const PRESETS: Record<string, MatrixConfigUpdate> = {
  smartrisk: {
    likelihood_scale:5, impact_scale:5, band_count:4,
    band_1_label:'Low', band_2_label:'Medium', band_3_label:'High', band_4_label:'Critical', band_5_label:'Extreme',
    band_low_min:1, band_low_max:4, band_medium_min:5, band_medium_max:9,
    band_high_min:10, band_high_max:16, band_critical_min:17, band_critical_max:25,
    band_extreme_min:21, band_extreme_max:25,
  },
  isscl: {
    likelihood_scale:5, impact_scale:5, band_count:4,
    band_1_label:'Low', band_2_label:'Medium', band_3_label:'High', band_4_label:'Critical', band_5_label:'Extreme',
    band_low_min:1, band_low_max:10, band_medium_min:11, band_medium_max:15,
    band_high_min:16, band_high_max:20, band_critical_min:21, band_critical_max:25,
    band_extreme_min:22, band_extreme_max:25,
  },
};

const SCALE_OPTIONS = [3, 4, 5, 6] as const;

type BandKey = 'low' | 'medium' | 'high' | 'critical' | 'extreme';


interface Band { key: BandKey; index: number; note: string; labelKey: keyof MatrixConfigUpdate; }

const BANDS: Band[] = [
  { key: 'low',      index: 1, note: 'Routine monitoring',   labelKey: 'band_1_label' },
  { key: 'medium',   index: 2, note: 'Management oversight', labelKey: 'band_2_label' },
  { key: 'high',     index: 3, note: 'Enhanced mitigation',  labelKey: 'band_3_label' },
  { key: 'critical', index: 4, note: 'Immediate escalation', labelKey: 'band_4_label' },
  { key: 'extreme',  index: 5, note: 'Extreme response',     labelKey: 'band_5_label' },
];

function bandClass(score: number, cfg: MatrixConfigUpdate): 'l' | 'm' | 'h' | 'c' | 'e' {
  if (cfg.band_count >= 5 && score >= cfg.band_extreme_min)  return 'e';
  if (cfg.band_count >= 4 && score >= cfg.band_critical_min) return 'c';
  if (cfg.band_count >= 3 && score >= cfg.band_high_min)     return 'h';
  if (cfg.band_count >= 2 && score >= cfg.band_medium_min)   return 'm';
  return 'l';
}

const BAND_MINS: (keyof MatrixConfigUpdate)[] = ['band_low_min', 'band_medium_min', 'band_high_min', 'band_critical_min', 'band_extreme_min'];
const BAND_MAXS: (keyof MatrixConfigUpdate)[] = ['band_low_max', 'band_medium_max', 'band_high_max', 'band_critical_max', 'band_extreme_max'];

function validate(cfg: MatrixConfigUpdate): string {
  const max = cfg.likelihood_scale * cfg.impact_scale;
  const bc  = cfg.band_count;
  const mins = BAND_MINS.slice(0, bc).map(k => cfg[k] as number);
  const maxs = BAND_MAXS.slice(0, bc).map(k => cfg[k] as number);

  if (mins[0] !== 1) return 'First band must start at 1.';
  for (let i = 0; i < bc - 1; i++) {
    if (maxs[i] + 1 !== mins[i + 1]) return `Gap or overlap between band ${i + 1} and band ${i + 2}.`;
  }
  if (maxs[bc - 1] !== max) return `Last band must end at ${max} (${cfg.likelihood_scale}x${cfg.impact_scale}, ${bc} bands).`;
  return '';
}

// ── Component ───────────────────────────────────────────────────────────────

export default function MatrixSettings() {
  const { query, save } = useMatrix();
  const [form, setForm] = useState<MatrixConfigUpdate>(MATRIX_DEFAULTS);
  const [activePreset, setActivePreset] = useState<string>('smartrisk');
  const [msg, setMsg] = useState('');
  const [initialized, setInitialized] = useState(false);

  if (query.data && !initialized) {
    setForm({ ...query.data });
    setActivePreset(detectPreset(query.data));
    setInitialized(true);
  }

  const warnMsg = useMemo(() => validate(form), [form]);

  const isDirty = query.data
    ? (Object.keys(MATRIX_DEFAULTS) as (keyof MatrixConfigUpdate)[]).some(
        (k) => form[k] !== (query.data as MatrixConfigUpdate)[k]
      )
    : false;

  function setField(key: keyof MatrixConfigUpdate, value: number) {
    setForm((f) => ({ ...f, [key]: value }));
    setActivePreset('custom');
  }

  function applyPreset(name: string) {
    if (name === 'custom') { setActivePreset('custom'); return; }
    const p = PRESETS[name];
    if (!p) return;
    setForm({ ...p });
    setActivePreset(name);
  }

  function handleSave() {
    if (warnMsg) return;
    setMsg('');
    save.mutate(form, {
      onSuccess: () => setMsg('Matrix configuration saved.'),
      onError:   (e) => setMsg(e instanceof Error ? e.message : 'Save failed.'),
    });
  }

  function handleReset() {
    if (query.data) { setForm({ ...query.data }); setActivePreset(detectPreset(query.data)); }
  }

  // Heatmap cells
  const cells = useMemo(() => {
    const L = form.likelihood_scale;
    const I = form.impact_scale;
    const rows: Array<{ score: number; cls: string }> = [];
    for (let imp = I; imp >= 1; imp--) {
      for (let lik = 1; lik <= L; lik++) {
        const s = imp * lik;
        rows.push({ score: s, cls: `mx-cell mx-cell-${bandClass(s, form)}` });
      }
    }
    return { rows, L, I };
  }, [form]);

  const legendCounts = useMemo(() => {
    const c = { l: 0, m: 0, h: 0, c: 0, e: 0 };
    for (let imp = 1; imp <= form.impact_scale; imp++) {
      for (let lik = 1; lik <= form.likelihood_scale; lik++) {
        c[bandClass(imp * lik, form)]++;
      }
    }
    return c;
  }, [form]);

  if (query.isLoading) return <p className="muted small">Loading…</p>;
  if (query.isError)   return <p style={{ color: '#ef4444', fontSize: 13 }}>Failed to load matrix config.</p>;

  return (
    <div className="settings-section">
      {isDirty && !warnMsg && <UnsavedBanner onSave={handleSave} saving={save.isPending} />}

      <div className="settings-title">Risk Matrix &amp; Scoring Bands</div>
      <p className="muted small" style={{ marginBottom: 20 }}>
        Define how risk is scored in this workspace. Set the matrix dimensions, then map severity scores to bands.
        Saving re-classifies all existing risks immediately.
      </p>

      <div className="mx-grid">
        {/* LEFT: controls */}
        <div>
          {/* Card 1: Dimensions */}
          <div className="settings-section" style={{ marginBottom: 14 }}>
            <div className="mx-card-header">
              <span className="mx-card-num">1</span>
              <span className="mx-card-title">Matrix dimensions</span>
            </div>
            <p className="mx-card-desc">Severity = Likelihood x Impact. A 5x5 matrix scores 1 to 25.</p>
            <div className="mx-dims">
              <div className="field">
                <label>Likelihood scale</label>
                <select
                  value={form.likelihood_scale}
                  onChange={(e) => setField('likelihood_scale', Number(e.target.value))}
                >
                  {SCALE_OPTIONS.map(n => <option key={n} value={n}>1 – {n}</option>)}
                </select>
              </div>
              <div className="mx-dims-x">x</div>
              <div className="field">
                <label>Impact scale</label>
                <select
                  value={form.impact_scale}
                  onChange={(e) => setField('impact_scale', Number(e.target.value))}
                >
                  {SCALE_OPTIONS.map(n => <option key={n} value={n}>1 – {n}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Max severity</label>
                <input
                  type="number"
                  value={form.likelihood_scale * form.impact_scale}
                  readOnly
                  style={{ background: 'var(--bg)', color: 'var(--muted)', cursor: 'default' }}
                />
              </div>
            </div>
          </div>

          {/* Card 2: Bands */}
          <div className="settings-section">
            <div className="mx-card-header">
              <span className="mx-card-num">2</span>
              <span className="mx-card-title">Band thresholds</span>
            </div>
            <p className="mx-card-desc">Ranges must be contiguous and cover every score with no gaps.</p>

            {/* Band count */}
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Number of bands</label>
              <select
                value={form.band_count}
                onChange={(e) => { setField('band_count', Number(e.target.value)); setActivePreset('custom'); }}
              >
                <option value={2}>2 bands</option>
                <option value={3}>3 bands</option>
                <option value={4}>4 bands</option>
                <option value={5}>5 bands</option>
              </select>
            </div>

            <div className="mx-presets">
              <span className="mx-preset-label">Start from:</span>
              {(['smartrisk', 'isscl', 'custom'] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`mx-chip${activePreset === name ? ' active' : ''}`}
                  onClick={() => applyPreset(name)}
                >
                  {name === 'smartrisk' ? 'SmartRisk default' : name === 'isscl' ? 'ISSCL / pension scale' : 'Custom'}
                </button>
              ))}
            </div>

            <div className="mx-bands">
              {BANDS.filter(b => b.index <= form.band_count).map(({ key, index, note, labelKey }) => {
                const minKey = `band_${key}_min` as keyof MatrixConfigUpdate;
                const maxKey = `band_${key}_max` as keyof MatrixConfigUpdate;
                return (
                  <div key={key} className="mx-band-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`mx-dot mx-dot-${key}`} />
                        <input
                          style={{ fontWeight: 800, border: 'none', background: 'transparent', padding: 0, width: 90, color: 'var(--text)' }}
                          value={String(form[labelKey])}
                          onChange={(e) => setField(labelKey, e.target.value as never)}
                        />
                      </div>
                      <span className="mx-band-note" style={{ paddingLeft: 17 }}>Band {index}</span>
                    </div>
                    <div className="mx-range">
                      <input
                        type="number"
                        value={form[minKey] as number}
                        min={1}
                        onChange={(e) => setField(minKey, Number(e.target.value))}
                      />
                      <span className="mx-range-to">to</span>
                      <input
                        type="number"
                        value={form[maxKey] as number}
                        min={1}
                        onChange={(e) => setField(maxKey, Number(e.target.value))}
                      />
                    </div>
                    <span className="mx-band-note">{note}</span>
                  </div>
                );
              })}
            </div>

            {warnMsg && <div className="mx-warn visible">&#9888; {warnMsg}</div>}
          </div>
        </div>

        {/* RIGHT: live preview */}
        <div className="settings-section">
          <div className="mx-card-header">
            <span className="mx-card-num" style={{ background: 'rgba(1,184,142,.12)', color: 'var(--primary)' }}>✓</span>
            <span className="mx-card-title">Live preview</span>
          </div>
          <p className="mx-card-desc">Every severity score coloured by your bands. This is exactly how your heat map will read.</p>

          <div className="mx-hm-wrap">
            <div className="mx-hm-yaxis">Impact</div>
            <div className="mx-hm-main">
              <div
                className="mx-hm"
                style={{ gridTemplateColumns: `repeat(${cells.L}, 1fr)` }}
              >
                {cells.rows.map(({ score, cls }, i) => (
                  <div key={i} className={cls}>{score}</div>
                ))}
              </div>
              <div className="mx-hm-xlabel">Likelihood →</div>
            </div>
          </div>

          <div className="mx-legend">
            {([['low','Low',legendCounts.l],['medium','Medium',legendCounts.m],['high','High',legendCounts.h],['critical','Critical',legendCounts.c],['extreme','Extreme',legendCounts.e]] as const).map(
              ([key, name, count]) => (
                <span key={key} className="mx-leg">
                  <span className={`mx-dot mx-dot-${key}`} />
                  {name} · {count} cells
                </span>
              )
            )}
          </div>
        </div>
      </div>

      <div className="mx-actions">
        <span className="muted small">Changes apply to this workspace only and re-score all risks immediately.</span>
        <div className="btns" style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={handleReset}>Reset</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={save.isPending || !!warnMsg}
          >
            {save.isPending ? 'Saving…' : 'Save configuration'}
          </button>
        </div>
      </div>

      {msg && (
        <p style={{ fontSize: 13, marginTop: 10, color: msg.includes('failed') || msg.includes('risk') ? '#ef4444' : '#01b88e' }}>
          {msg}
        </p>
      )}
    </div>
  );
}