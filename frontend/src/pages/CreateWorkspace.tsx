// src/pages/CreateWorkspace.tsx
// Setup wizard, 3 steps: you and your workspace, how you score risk, your appetite.
// Each step is saved to the account's draft (PUT /api/v1/onboarding/draft), so a
// closed tab resumes here. Finish creates the workspace, categories and appetite
// in one go (POST /api/v1/onboarding/finish); the logo uploads right after.

import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Circle, Minus, Plus, Upload } from 'lucide-react';
import { SrLogo } from '../components/layout/SrLogo';
import { useAuthStore } from '../store/authStore';
import { apiPatch, apiPost } from '../services/api';
import { uploadLogo } from '../services/settings';
import { finishOnboarding, getOnboardingDraft, saveOnboardingDraft, useOnboardingOptions } from '../services/onboarding';
import type { LoginResult, WorkspaceInfo } from '../types/auth';
import type { ModuleKey } from '../types/api';
import { EMPTY_ONBOARDING, type OnboardingData, type OnboardingOptions } from '../types/onboarding';
import type { SetupLogoResult, SetupReadyState } from '../types/setup';
import { levelChipClass } from '../utils/riskDisplay';
import JoinTeamCard from '../components/onboarding/JoinTeamCard';

const errorText = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

const STEP_TITLES = ['You and your workspace', 'How you score risk', 'Your appetite'];

function savedLabel(iso: string | null, now: number): string {
  if (!iso) return '';
  const secs = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (secs < 45) return 'Saved just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `Saved ${mins} minute${mins === 1 ? '' : 's'} ago`;
  return 'Saved';
}

// Band of each matrix cell, highest likelihood row first, for the preview grid.
// SmartRisk suggested categories for a sector, or the defaults before one is picked.
function baseCategories(options: OnboardingOptions, sector: string | null): string[] {
  const rows = sector ? options.suggestions[sector] : undefined;
  return rows?.length ? rows.map(r => r.category) : options.default_categories;
}

// SmartRisk's suggested threshold for a category in this sector, if there is one.
function suggestedValue(options: OnboardingOptions, sector: string | null, cat: string): number | undefined {
  const rows = sector ? options.suggestions[sector] ?? [] : [];
  return rows.find(r => r.category.toLowerCase() === cat.toLowerCase())?.threshold;
}

// Where a category starts: its suggestion, else the middle of the scale.
function startValue(options: OnboardingOptions, sector: string | null, cat: string): number {
  return suggestedValue(options, sector, cat) ?? options.appetite_start;
}

function heatCells(options: OnboardingOptions): number[] {
  const side = Math.round(Math.sqrt(options.matrix_max));
  const cells: number[] = [];
  for (let l = side; l >= 1; l--) {
    for (let i = 1; i <= side; i++) cells.push(options.band_for_score[l * i - 1] ?? 1);
  }
  return cells;
}

// ── Steps (module scope) ─────────────────────────────────────────────────────

interface StepProps {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
}

function StepWorkspace({ data, onChange, logoFile, logoPreview, onLogo, email }: StepProps & {
  logoFile: File | null;
  logoPreview: string | null;
  onLogo: (file: File | null) => void;
  email: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    onLogo(e.target.files?.[0] ?? null);
    e.target.value = '';
  }

  return (
    <>
      <div className="wiz-field">
        <label htmlFor="ws-name">Workspace name</label>
        <p className="wiz-upload-hint wiz-field-hint">Your team or department, for example "Risk Dept".</p>
        <input
          id="ws-name"
          type="text"
          maxLength={200}
          value={data.workspace_name ?? ''}
          onChange={e => onChange({ workspace_name: e.target.value })}
        />
      </div>
      <div className="wiz-field">
        <label htmlFor="ws-org">Organisation <span className="wiz-optional">optional</span></label>
        <p className="wiz-upload-hint wiz-field-hint">Used in reports and board briefs.</p>
        <input
          id="ws-org"
          type="text"
          maxLength={200}
          value={data.org_name ?? ''}
          onChange={e => onChange({ org_name: e.target.value })}
        />
      </div>

      <div className="wiz-field">
        <label>Organisation logo <span className="wiz-optional">optional</span></label>
        <button type="button" className="wiz-upload" onClick={() => fileRef.current?.click()}>
          {logoPreview
            ? <img src={logoPreview} alt="Logo preview" className="wiz-upload-preview" />
            : <span className="wiz-upload-icon"><Upload size={18} /></span>}
          <span>
            <span className="wiz-upload-label">{logoFile ? logoFile.name : 'Drop a logo here, or browse'}</span>
            <span className="wiz-upload-hint">PNG, JPG or WebP, up to 2 MB. Shown in the sidebar and on reports.</span>
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={handleFile} />
      </div>

      {email && <p className="wiz-upload-hint">Signed up as {email}</p>}
    </>
  );
}

function StepScoring({ data, onChange, options }: StepProps & { options: OnboardingOptions }) {
  const [custom, setCustom] = useState('');
  const picked = new Set(data.categories.map(c => c.toLowerCase()));
  // The sector's suggested categories (or the defaults) first, then anything the user added.
  const base = baseCategories(options, data.sector);
  const all = [
    ...base,
    ...data.categories.filter(c => !base.some(d => d.toLowerCase() === c.toLowerCase())),
  ];

  // A sector selects its SmartRisk suggested categories. Categories the user
  // added themselves are kept; appetite values restart from the new suggestions.
  function pickSector(s: string) {
    if (s === data.sector) return;
    const oldBase = baseCategories(options, data.sector).map(c => c.toLowerCase());
    const own = data.categories.filter(c => !oldBase.includes(c.toLowerCase()));
    const next = baseCategories(options, s);
    const merged = [...next, ...own.filter(c => !next.some(n => n.toLowerCase() === c.toLowerCase()))];
    onChange({ sector: s, categories: merged.slice(0, options.max_categories), appetite: {} });
  }

  function toggle(cat: string) {
    const on = picked.has(cat.toLowerCase());
    onChange({ categories: on ? data.categories.filter(c => c.toLowerCase() !== cat.toLowerCase()) : [...data.categories, cat] });
  }

  function addCustom() {
    const name = custom.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (!picked.has(name.toLowerCase()) && data.categories.length < options.max_categories) {
      onChange({ categories: [...data.categories, name] });
    }
    setCustom('');
  }

  const enough = data.categories.length >= options.min_categories;

  return (
    <>
      <div className="wiz-field">
        <label>Your sector</label>
        <p className="wiz-upload-hint wiz-field-hint">
          Picking a sector selects SmartRisk's suggested categories for it. Currency, time zone and date format
          start as Naira, Lagos and DD/MM/YYYY. Change them in Settings.
        </p>
        <div className="wiz-chip-row" role="group" aria-label="Sector">
          {options.sectors.map(s => (
            <button
              key={s}
              type="button"
              className={`wiz-size-pill${data.sector === s ? ' selected' : ''}`}
              aria-pressed={data.sector === s}
              onClick={() => pickSector(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="wiz-field">
        <label>Risk matrix</label>
        <div className="wiz-matrix-cols">
          <div>
            <p className="wiz-band-name">SmartRisk default</p>
            <p className="wiz-upload-hint wiz-field-hint">Likelihood × impact. {options.bands.length} bands.</p>
            {options.bands.map((b, i) => (
              <div key={b.label} className="wiz-band">
                <span className={`pl-chip ${levelChipClass(i + 1, options.bands.length)}`}>{b.label}</span>
                <span className="wiz-band-range">{b.min} to {b.max}</span>
              </div>
            ))}
          </div>
          <div className="wiz-heatmap" aria-hidden="true">
            {heatCells(options).map((band, i) => (
              <div key={i} className={`wiz-heatmap-cell wiz-heat-${levelChipClass(band, options.bands.length)}`} />
            ))}
          </div>
        </div>
        <p className="wiz-upload-hint">Want a 3 × 3 or 4 × 4 scale, or your own band names? Change it in Settings, Risk Matrix, after setup.</p>
      </div>

      <div className="wiz-field">
        <label>
          Risk categories <span className={enough ? 'wiz-count-ok' : 'wiz-count-low'}>{data.categories.length} selected</span>
        </label>
        <p className="wiz-upload-hint wiz-field-hint">
          Pick at least {options.min_categories}. You set an appetite for each one in the next step.
        </p>
        <div className="wiz-chip-row" role="group" aria-label="Risk categories">
          {all.map(c => {
            const on = picked.has(c.toLowerCase());
            return (
              <button
                key={c}
                type="button"
                className={`wiz-size-pill${on ? ' selected' : ''}`}
                aria-pressed={on}
                onClick={() => toggle(c)}
              >
                {on && <Check size={12} aria-hidden="true" />} {c}
              </button>
            );
          })}
        </div>
        <div className="wiz-add-row">
          <input
            type="text"
            maxLength={200}
            placeholder="Add your own"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
            aria-label="Add your own category"
          />
          <button type="button" className="wiz-btn" onClick={addCustom} disabled={!custom.trim()}>
            <Plus size={14} aria-hidden="true" /> Add
          </button>
        </div>
      </div>
    </>
  );
}

function StepAppetite({ data, onChange, options }: StepProps & { options: OnboardingOptions }) {
  const max = options.matrix_max;
  const count = options.bands.length;
  // Band edges as positions on the bar; the colours live in index.css.
  const stops = options.bands.slice(0, -1).map(b => `${(b.max / max) * 100}%`);
  const trackStyle = Object.fromEntries(stops.map((p, i) => [`--wiz-stop-${i + 1}`, p])) as CSSProperties;

  function set(cat: string, value: number) {
    const v = Math.min(max, Math.max(1, value));
    onChange({ appetite: { ...data.appetite, [cat]: v }, appetite_skipped: false });
  }

  const value = (cat: string) => data.appetite[cat] ?? startValue(options, data.sector, cat);
  const edited = data.categories.some(c => {
    const s = suggestedValue(options, data.sector, c);
    return s !== undefined && value(c) !== s;
  });
  const anyOwn = data.categories.some(c => suggestedValue(options, data.sector, c) === undefined);

  function resetToSuggested() {
    const appetite: Record<string, number> = { ...data.appetite };
    data.categories.forEach(c => {
      const s = suggestedValue(options, data.sector, c);
      if (s !== undefined) appetite[c] = s;
    });
    onChange({ appetite, appetite_skipped: false });
  }

  return (
    <>
      <div className="wiz-appetite-head">
        <span className="wiz-band-name">Thresholds by category</span>
        <span className="wiz-upload-hint">
          {data.categories.length} categories{data.sector ? ` · ${data.sector}` : ''} · scale 1 to {max}
        </span>
      </div>
      <div className="wiz-suggest-banner">
        <span className="wiz-suggest-tag">SmartRisk suggested</span>
        <span className="wiz-suggest-text">
          {options.appetite_note} Starting points, not regulatory limits.{' '}
          {options.guide_url && (
            <a href={options.guide_url} target="_blank" rel="noopener noreferrer">How these are set</a>
          )}
        </span>
        {edited && (
          <button type="button" className="wiz-btn-ghost" onClick={resetToSuggested}>Reset to suggested</button>
        )}
      </div>
      <div className="wiz-appetite-list">
        {data.categories.map(cat => {
          const v = value(cat);
          const band = options.band_for_score[v - 1] ?? 1;
          const sug = suggestedValue(options, data.sector, cat);
          return (
            <div key={cat} className="wiz-appetite-row">
              <span className="wiz-appetite-cat">
                {cat}
                <span className="wiz-upload-hint wiz-appetite-sug">
                  {sug === undefined ? 'Your category' : sug === v ? 'Suggested' : `Suggested ${sug}`}
                </span>
              </span>
              <div className="wiz-stepper">
                <button type="button" aria-label={`Lower ${cat}`} disabled={v <= 1} onClick={() => set(cat, v - 1)}>
                  <Minus size={14} />
                </button>
                <span className="wiz-stepper-val" aria-live="polite">{v}</span>
                <button type="button" aria-label={`Raise ${cat}`} disabled={v >= max} onClick={() => set(cat, v + 1)}>
                  <Plus size={14} />
                </button>
              </div>
              <div className="wiz-appetite-scale">
                <span
                  className={`wiz-appetite-track wiz-bands-${count}`}
                  style={{ ...trackStyle, ['--wiz-pos' as string]: `${(v / max) * 100}%` }}
                  aria-hidden="true"
                />
                <span className="wiz-upload-hint">
                  Tolerates up to <span className={`pl-chip ${levelChipClass(band, count)}`}>{options.bands[band - 1]?.label}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="wiz-callout">
        <span className="wiz-callout-icon">✦</span>
        <p>
          Not sure yet? Keep the suggestions. Low-tolerance areas start tight on purpose, so some risks may show as
          outside appetite at first.{anyOwn ? ` Categories you added start at ${options.appetite_start}, the middle of the scale.` : ''}{' '}
          Your board can approve different thresholds later in Settings, Risk Appetite, and every change is kept in the Audit Log.
        </p>
      </div>
    </>
  );
}

// ── Wizard ───────────────────────────────────────────────────────────────────

export default function CreateWorkspace() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { claims, setToken, workspaces, setWorkspaces } = useAuthStore();
  const optionsQuery = useOnboardingOptions();
  const options = optionsQuery.data;

  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(EMPTY_ONBOARDING);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Resume a saved draft, or start with the default categories selected.
  useEffect(() => {
    if (!options || loaded) return;
    let cancelled = false;
    getOnboardingDraft()
      .then(draft => {
        if (cancelled) return;
        if (draft) {
          setData({ ...EMPTY_ONBOARDING, ...draft.data });
          setStep(Math.min(3, Math.max(1, draft.step)));
          setSavedAt(draft.updated_at);
        } else {
          setData({ ...EMPTY_ONBOARDING, categories: [...options.default_categories] });
        }
      })
      .catch(() => {
        if (!cancelled) setData({ ...EMPTY_ONBOARDING, categories: [...options.default_categories] });
      })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [options, loaded]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);

  function patch(updates: Partial<OnboardingData>) {
    setData(prev => ({ ...prev, ...updates }));
  }

  function onLogo(file: File | null) {
    if (file && file.size > 2 * 1024 * 1024) {
      setError('The logo must be 2 MB or smaller.');
      return;
    }
    setError('');
    setLogoFile(file);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  }

  // Appetite values for every picked category: the SmartRisk suggestion for the
  // sector, or the middle of the scale for a category the user added.
  function withAppetite(d: OnboardingData, o: OnboardingOptions): OnboardingData {
    const appetite: Record<string, number> = {};
    d.categories.forEach(c => { appetite[c] = d.appetite[c] ?? startValue(o, d.sector, c); });
    return { ...d, appetite };
  }

  function canContinue(): boolean {
    if (!options) return false;
    if (step === 1) return !!data.workspace_name?.trim();
    if (step === 2) return data.categories.length >= options.min_categories;
    return true;
  }

  async function save(nextStep: number, next: OnboardingData) {
    const draft = await saveOnboardingDraft(nextStep, next);
    setSavedAt(draft.updated_at);
    setNow(Date.now());
  }

  async function goNext() {
    if (!options || busy || !canContinue()) return;
    setBusy(true);
    setError('');
    try {
      const next = step === 2 ? withAppetite(data, options) : data;
      await save(step + 1, next);
      setData(next);
      setStep(step + 1);
    } catch (err: unknown) {
      setError(errorText(err, 'Could not save this step. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    if (busy) return;
    setError('');
    setStep(s => Math.max(1, s - 1));
  }

  async function handleFinish(skipAppetite: boolean) {
    if (!options || busy) return;
    setBusy(true);
    setError('');
    try {
      const final = skipAppetite ? { ...data, appetite_skipped: true } : withAppetite(data, options);
      await save(3, final);
      const result = await finishOnboarding();

      const authResult = await apiPost<LoginResult>('/api/v1/auth/select-workspace', { tenant_id: result.workspace_id });
      setToken(authResult.access_token);
      const entry: WorkspaceInfo = {
        tenant_id: result.workspace_id,
        name: result.workspace_name,
        role: 'Owner',
        plan: 'TRIAL',
        modules: ['risk', 'incident'] as ModuleKey[],
      };
      setWorkspaces([...workspaces.filter(w => w.tenant_id !== result.workspace_id), entry]);

      // The workspace exists now, so a logo failure is reported on Ready, not here.
      let logo: SetupLogoResult = 'none';
      let logoError = '';
      if (logoFile) {
        try {
          const { logo_url } = await uploadLogo(logoFile);
          await apiPatch('/api/v1/settings', { logo_url });
          logo = 'saved';
        } catch (err: unknown) {
          logo = 'failed';
          logoError = errorText(err, 'Your logo could not be uploaded.');
        }
      }

      const ready: SetupReadyState = {
        workspace: result.workspace_name,
        organisation: (final.org_name ?? '').trim(),
        categories: result.categories,
        logo,
        logoError,
        appetiteSaved: result.appetite_saved,
        appetiteSkipped: !!final.appetite_skipped,
      };
      queryClient.clear();
      navigate('/workspaces/ready', { replace: true, state: ready });
    } catch (err: unknown) {
      setError(errorText(err, 'Could not finish setup. Nothing was created, so you can try again.'));
      setBusy(false);
    }
  }

  const railSubs = [
    'Name, logo',
    data.categories.length ? `Default matrix · ${data.categories.length} categories` : 'Matrix and categories',
    'What Home flags',
  ];

  return (
    <div className="wiz-shell">
      <div className="wiz-rail">
        <div>
          <div className="wiz-brand">
            <SrLogo size={32} borderRadius={7} />
            <span className="wiz-brand-name">SmartRisk Pulse</span>
          </div>
          <h2 className="wiz-rail-title">Set up your workspace</h2>
          <p className="wiz-rail-copy">Three short steps. Each one switches on part of your Home.</p>
        </div>
        <div className="wiz-checklist">
          <div className="wiz-check-item done">
            <span className="wiz-check-dot"><Check size={13} /></span>Account created
          </div>
          {STEP_TITLES.map((title, idx) => {
            const n = idx + 1;
            const state = n < step ? 'done' : n === step ? 'current' : 'todo';
            return (
              <div key={title} className={`wiz-check-item ${state}`}>
                <span className="wiz-check-dot">
                  {state === 'done' ? <Check size={13} /> : state === 'current' ? <span className="wiz-check-cur" /> : <Circle size={13} />}
                </span>
                <span>{title}<span className="wiz-check-sub">{railSubs[idx]}</span></span>
              </div>
            );
          })}
          <div className="wiz-check-item todo">
            <span className="wiz-check-dot"><Circle size={13} /></span>Ready
          </div>
        </div>
        <p className="wiz-rail-copy">Saved as you go. Close the tab and you pick up here.</p>
      </div>

      <div className="wiz-content">
        <div className="wiz-panel">
          <div className="wiz-progress">
            <div className="wiz-progress-fill" style={{ width: `${(step / 3) * 100}%` }} />
          </div>
          <div className="wiz-step-head">
            <span className="wiz-rail-eyebrow">Step {step} of 3</span>
            {savedAt && <span className="wiz-upload-hint">{savedLabel(savedAt, now)}</span>}
          </div>
          <h2 className="wiz-panel-title">{STEP_TITLES[step - 1]}</h2>
          <p className="wiz-panel-sub">
            {[
              'This is what your team sees at the top of Pulse. You can change all of it later in Settings.',
              'Pick your sector and the categories your risks fall into. This switches on the Health score on your Home.',
              'Set the highest residual score each category can carry. Any risk above its line shows as Outside appetite on your Home.',
            ][step - 1]}
          </p>

          {error && <div className="wiz-error" role="alert">{error}</div>}

          {optionsQuery.isError && (
            <div className="wiz-error" role="alert">
              Setup could not load.{' '}
              <button type="button" className="wiz-btn-ghost" onClick={() => optionsQuery.refetch()}>Try again</button>
            </div>
          )}

          {(!options || !loaded) && !optionsQuery.isError && <p className="wiz-upload-hint" role="status">Loading…</p>}

          {options && loaded && (
            <>
              {step === 1 && <JoinTeamCard />}
              {step === 1 && (
                <StepWorkspace
                  data={data}
                  onChange={patch}
                  logoFile={logoFile}
                  logoPreview={logoPreview}
                  onLogo={onLogo}
                  email={claims?.email ?? ''}
                />
              )}
              {step === 2 && <StepScoring data={data} onChange={patch} options={options} />}
              {step === 3 && <StepAppetite data={data} onChange={patch} options={options} />}

              <div className="wiz-footer">
                {step === 1
                  ? <span />
                  : <button type="button" className="wiz-btn" disabled={busy} onClick={goBack}>Back</button>}
                {step < 3 ? (
                  <button type="button" className="wiz-btn wiz-btn-primary" disabled={busy || !canContinue()} onClick={goNext}>
                    {busy ? 'Saving…' : 'Save and continue'}
                  </button>
                ) : (
                  <div className="wiz-footer-actions">
                    <button type="button" className="wiz-btn-ghost" disabled={busy} onClick={() => handleFinish(true)}>
                      Skip for now
                    </button>
                    <button type="button" className="wiz-btn wiz-btn-launch" disabled={busy} onClick={() => handleFinish(false)}>
                      {busy ? 'Setting up…' : 'Save and finish setup'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
