import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2, Heart, Droplets, Factory, Cpu, Landmark, Zap, MoreHorizontal,
  Check, Circle, Upload, Plus, Trash2, Rocket, X,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { apiPost, apiPatch, apiGet } from '../services/api';
import { uploadLogo } from '../services/settings';
import type { LoginResult, WorkspaceInfo } from '../types/auth';
import type { ModuleKey } from '../types/api';
import {
  WIZARD_INDUSTRIES, ORG_SIZES, FRAMEWORKS, CURRENCIES,
  TIMEZONES, DATE_FORMATS, WIZARD_BAND_ROWS, WIZARD_HEATMAP, WIZARD_ROLES,
  WIZARD_CATEGORY_EXAMPLES,
} from '../utils/constants';

// ── Types ────────────────────────────────────────────────────────────────────
interface WizardData {
  orgName: string;
  workspaceName: string;
  logoFile: File | null;
  logoPreview: string | null;
  industry: string;
  orgSize: string;
  framework: string;
  currency: string;
  timezone: string;
  dateFormat: string;
  invites: { email: string; role: string }[];
  categories: { name: string; owner: string }[];
}

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Building2, Heart, Droplets, Factory, Cpu, Landmark, Zap, MoreHorizontal,
};

function buildLaunchSteps(data: WizardData): string[] {
  const steps = [
    'Preparing your workspace…',
    'Creating your workspace…',
    'Configuring your risk matrix…',
  ];
  if (data.categories.some(c => c.name.trim())) steps.push('Seeding risk categories…');
  if (data.logoFile)                             steps.push('Uploading your logo…');
  if (data.invites.some(i => i.email.trim()))    steps.push('Inviting your team…');
  steps.push('Almost ready…');
  return steps;
}

const INITIAL_DATA: WizardData = {
  orgName: '', workspaceName: '', logoFile: null, logoPreview: null,
  industry: '', orgSize: '', framework: 'ISO 31000', currency: '₦',
  timezone: 'Africa/Lagos', dateFormat: 'DD/MM/YYYY',
  invites: [{ email: '', role: 'Analyst' }],
  categories: [
    { name: '', owner: '' },
    { name: '', owner: '' },
    { name: '', owner: '' },
  ],
};

const STEPS = [
  'Workspace & logo',
  'Industry & size',
  'Framework defaults',
  'Risk matrix',
  'Risk categories',
  'Invite team',
];

// ── Step sub-components (module scope) ───────────────────────────────────────

interface StepProps {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
}

function StepWorkspace({ data, onChange }: StepProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    onChange({ logoFile: file, logoPreview: preview });
  }

  return (
    <>
      <div className="wiz-field">
        <label>Workspace name</label>
        <p className="wiz-upload-hint" style={{ marginTop: 0, marginBottom: 6 }}>
          Your department or team, e.g. "Risk Department." Shows in the sidebar, reports, and briefs.
        </p>
        <input
          type="text"
          value={data.workspaceName}
          onChange={e => onChange({ workspaceName: e.target.value })}
          placeholder="Risk Department"
        />
      </div>
      <div className="wiz-field">
        <label>Organization name <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
        <p className="wiz-upload-hint" style={{ marginTop: 0, marginBottom: 6 }}>
          The parent company or entity, e.g. "Acme Financial Group." Used in report covers and board briefs.
        </p>
        <input
          type="text"
          value={data.orgName}
          onChange={e => onChange({ orgName: e.target.value })}
          placeholder="Acme Financial Group"
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Logo</label>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Optional — add anytime in Settings</span>
      </div>
      <div className="wiz-upload" onClick={() => fileRef.current?.click()}>
        {data.logoPreview
          ? <img src={data.logoPreview} alt="Logo preview" className="wiz-upload-preview" />
          : <div className="wiz-upload-icon"><Upload size={18} /></div>
        }
        <div>
          <div className="wiz-upload-label">
            {data.logoFile ? data.logoFile.name : 'Drag and drop, or click to browse'}
          </div>
          <div className="wiz-upload-hint">PNG, JPG or SVG · up to 2 MB · min 200×200 px</div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
      </div>
    </>
  );
}

function StepIndustry({ data, onChange }: StepProps) {
  return (
    <>
      <div className="wiz-tile-grid">
        {WIZARD_INDUSTRIES.map(ind => {
          const Icon = ICON_MAP[ind.icon];
          return (
            <button
              key={ind.key}
              type="button"
              className={`wiz-tile${data.industry === ind.key ? ' selected' : ''}`}
              onClick={() => onChange({ industry: ind.key })}
            >
              <div className="wiz-tile-icon">{Icon && <Icon size={20} />}</div>
              {ind.key}
            </button>
          );
        })}
      </div>

      <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 8 }}>
        Organization size
      </label>
      <div className="wiz-size-row">
        {ORG_SIZES.map(s => (
          <button
            key={s}
            type="button"
            className={`wiz-size-pill${data.orgSize === s ? ' selected' : ''}`}
            onClick={() => onChange({ orgSize: s })}
          >
            {s}
          </button>
        ))}
      </div>
    </>
  );
}

function StepFramework({ data, onChange }: StepProps) {
  const currencyLabel = CURRENCIES.find(c => c.value === data.currency)?.value ?? data.currency;

  return (
    <>
      <div className="wiz-two-col">
        <div className="wiz-field">
          <label>Framework</label>
          <select value={data.framework} onChange={e => onChange({ framework: e.target.value })}>
            {FRAMEWORKS.map(f => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div className="wiz-field">
          <label>Currency</label>
          <select value={data.currency} onChange={e => onChange({ currency: e.target.value })}>
            {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="wiz-field">
          <label>Timezone</label>
          <select value={data.timezone} onChange={e => onChange({ timezone: e.target.value })}>
            {TIMEZONES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="wiz-field">
          <label>Date format</label>
          <select value={data.dateFormat} onChange={e => onChange({ dateFormat: e.target.value })}>
            {DATE_FORMATS.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div className="wiz-callout">
        <span className="wiz-callout-icon">✦</span>
        <p>
          Preview: amounts will display like <strong>{currencyLabel}1,000,000</strong> across your reports and briefs.
        </p>
      </div>
    </>
  );
}

function StepMatrix() {
  return (
    <>
      <div className="wiz-toggle">
        <button type="button" className="wiz-toggle-btn active">SmartRisk default</button>
        <button type="button" className="wiz-toggle-btn" disabled title="Available in Settings after launch">
          Custom
        </button>
      </div>

      <div className="wiz-matrix-cols">
        <div>
          {WIZARD_BAND_ROWS.map(b => (
            <div key={b.label} className="wiz-band">
              <span className="wiz-swatch" style={{ background: b.color }} />
              <span className="wiz-band-name">{b.label}</span>
              <span className="wiz-band-range">{b.range}</span>
            </div>
          ))}
        </div>
        <div>
          <p className="wiz-heatmap-label">Live preview</p>
          <div className="wiz-heatmap">
            {WIZARD_HEATMAP.map((color, i) => (
              <div key={i} className="wiz-heatmap-cell" style={{ background: color }} />
            ))}
          </div>
        </div>
      </div>

      <div className="wiz-callout">
        <span className="wiz-callout-icon">✦</span>
        <p>
          Severity = Likelihood × Impact. Bands and colours are editable anytime from <strong>Settings → Risk Matrix</strong>.
        </p>
      </div>
    </>
  );
}

function StepCategories({ data, onChange }: StepProps) {
  function updateCat(idx: number, key: 'name' | 'owner', val: string) {
    const next = data.categories.map((c, i) => i === idx ? { ...c, [key]: val } : c);
    onChange({ categories: next });
  }

  function addCat() {
    if (data.categories.length >= 3) return;
    onChange({ categories: [...data.categories, { name: '', owner: '' }] });
  }

  function removeCat(idx: number) {
    if (data.categories.length === 1) return;
    onChange({ categories: data.categories.filter((_, i) => i !== idx) });
  }

  function fillChip(example: string) {
    const emptyIdx = data.categories.findIndex(c => !c.name.trim());
    if (emptyIdx === -1) return;
    updateCat(emptyIdx, 'name', example);
  }

  return (
    <>
      <div className="wiz-example-row">
        <span className="wiz-example-label">Examples:</span>
        {WIZARD_CATEGORY_EXAMPLES.map(ex => (
          <button key={ex} type="button" className="wiz-example-chip" onClick={() => fillChip(ex)}>
            {ex}
          </button>
        ))}
      </div>

      <div className="wiz-col-labels">
        <span />
        <span>Risk category</span>
        <span>Owner name / role</span>
        <span />
      </div>

      {data.categories.map((cat, idx) => (
        <div key={idx} className="wiz-cat-row">
          <div className="wiz-cat-num">{idx + 1}</div>
          <input
            type="text"
            placeholder={`e.g. ${WIZARD_CATEGORY_EXAMPLES[idx] ?? 'Category'}`}
            value={cat.name}
            onChange={e => updateCat(idx, 'name', e.target.value)}
          />
          <input
            type="text"
            placeholder="e.g. Kola, Head of Strategy"
            value={cat.owner}
            onChange={e => updateCat(idx, 'owner', e.target.value)}
          />
          <button
            type="button"
            className="wiz-cat-remove"
            onClick={() => removeCat(idx)}
            title="Remove"
          >
            <X size={14} />
          </button>
        </div>
      ))}

      <button
        type="button"
        className="wiz-cat-add"
        disabled={data.categories.length >= 3}
        onClick={addCat}
      >
        <Plus size={14} />
        Add another {data.categories.length >= 3 ? '(max 3 for now)' : ''}
      </button>

      <div className="wiz-callout">
        <span className="wiz-callout-icon">✦</span>
        <p>
          These seed your Risk Register and drive <strong>Risk Distribution</strong> on the dashboard.
          Owners don't need app access yet — you can invite them in the next step.
        </p>
      </div>
    </>
  );
}

function StepInvite({ data, onChange }: StepProps) {
  function addRow() {
    onChange({ invites: [...data.invites, { email: '', role: 'Analyst' }] });
  }

  function updateRow(idx: number, key: 'email' | 'role', val: string) {
    const next = data.invites.map((inv, i) => i === idx ? { ...inv, [key]: val } : inv);
    onChange({ invites: next });
  }

  function removeRow(idx: number) {
    if (data.invites.length === 1) return;
    onChange({ invites: data.invites.filter((_, i) => i !== idx) });
  }

  return (
    <>
      {data.invites.map((inv, idx) => (
        <div key={idx} className="wiz-invite-row">
          <input
            type="email"
            placeholder="name@company.com"
            value={inv.email}
            onChange={e => updateRow(idx, 'email', e.target.value)}
          />
          <select value={inv.role} onChange={e => updateRow(idx, 'role', e.target.value)}>
            {WIZARD_ROLES.map(r => (
              <option key={r} value={r}>{r === 'Owner' ? 'Admin' : r}</option>
            ))}
          </select>
          {data.invites.length > 1 && (
            <button type="button" onClick={() => removeRow(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
      <button type="button" className="wiz-btn" style={{ marginBottom: '1.5rem' }} onClick={addRow}>
        <Plus size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
        Add another
      </button>
    </>
  );
}

// ── Main wizard component ─────────────────────────────────────────────────────

export default function CreateWorkspace() {
  const navigate   = useNavigate();
  const queryClient = useQueryClient();
  const { setToken, workspaces, setWorkspaces } = useAuthStore();

  const [step, setStep]     = useState(1);
  const [data, setData]     = useState<WizardData>(INITIAL_DATA);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [launchStep, setLaunchStep] = useState(0);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const [launchSteps, setLaunchSteps] = useState<string[]>(['Preparing your workspace…', 'Almost ready…']);

  useEffect(() => {
    if (!loading) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setLaunchStep(s => Math.min(s + 1, launchSteps.length - 1));
    }, 1500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loading, launchSteps.length]);

  function patch(updates: Partial<WizardData>) {
    setData(prev => ({ ...prev, ...updates }));
  }

  function canAdvance(): boolean {
    if (step === 1) return data.workspaceName.trim().length > 0;
    if (step === 2) return !!data.industry && !!data.orgSize;
    return true; // steps 3, 4, 5 are all optional / confirmatory
  }

  async function handleLaunch() {
    if (loading) return;
    setError('');
    setLaunchSteps(buildLaunchSteps(data));
    setLaunchStep(0);
    setLoading(true);
    try {
      const ws = await apiPost<{ id: string; name: string }>('/api/v1/workspaces', {
        name:         data.workspaceName.trim(),
        org_name:     data.orgName.trim() || undefined,
        industry:     data.industry     || undefined,
        org_size:     data.orgSize      || undefined,
        framework:    data.framework    || undefined,
        timezone:     data.timezone     || undefined,
        date_format:  data.dateFormat   || undefined,
        currency:     data.currency     || undefined,
      });

      const authResult = await apiPost<LoginResult>('/api/v1/auth/select-workspace', {
        tenant_id: ws.id,
      });
      setToken(authResult.access_token);

      // Add new workspace to store so sidebar reads it immediately
      const newEntry: WorkspaceInfo = {
        tenant_id: ws.id,
        name: data.workspaceName.trim(),
        role: 'Owner',
        plan: 'TRIAL',
        modules: ['risk'] as ModuleKey[],
      };
      setWorkspaces([...workspaces.filter(w => w.tenant_id !== ws.id), newEntry]);

      const filledCategories = data.categories
        .map(c => c.name.trim())
        .filter(Boolean);
      const filledOwners = data.categories
        .map(c => c.owner.trim())
        .filter(Boolean);
      if (filledCategories.length > 0 || filledOwners.length > 0) {
        try {
          const existing = await apiGet<{ category: string[]; risk_owner: string[] }>('/api/v1/lookups');
          const patch: Record<string, string[]> = {};
          if (filledCategories.length > 0) {
            patch.category = Array.from(new Set([
              ...(existing.category ?? []),
              ...filledCategories,
            ]));
          }
          if (filledOwners.length > 0) {
            patch.risk_owner = Array.from(new Set([
              ...(existing.risk_owner ?? []),
              ...filledOwners,
            ]));
          }
          await apiPatch('/api/v1/lookups', patch);
        } catch {
          // non-blocking
        }
      }

      if (data.logoFile) {
        try {
          const { logo_url } = await uploadLogo(data.logoFile);
          await apiPatch('/api/v1/settings', { logo_url });
        } catch {
          // non-blocking — user can upload from Settings
        }
      }

      for (const inv of data.invites) {
        if (inv.email.trim()) {
          apiPost('/api/v1/users', {
            email: inv.email.trim(),
            name:  inv.email.trim().split('@')[0],
            role:  inv.role,
          }).catch(() => {});
        }
      }

      queryClient.clear();
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace. Please try again.');
      setLoading(false);
    }
  }

  const progress = `${(step / 6) * 100}%`;

  return (
    <div className="wiz-shell">
      {/* Left rail */}
      <div className="wiz-rail">
        <div>
          <div className="wiz-brand">
            <img
              src="https://smartrisksheets.com/wp-content/uploads/2025/09/cropped-Smartrisksheets-favicon-v2.png"
              width="32" height="32"
              alt="SmartRisk Pulse"
              style={{ borderRadius: 7, flexShrink: 0 }}
            />
            <span className="wiz-brand-name">SmartRisk Pulse</span>
          </div>
          <p className="wiz-rail-eyebrow">Step {step} of 6</p>
          <h2 className="wiz-rail-title">{step === 6 ? 'Almost there' : 'Set up your workspace'}</h2>
          <p className="wiz-rail-copy">
            {step === 6
              ? 'Add teammates now, or skip and invite them anytime from Settings.'
              : 'Your organization details appear in your sidebar, reports, and board briefs.'}
          </p>
        </div>
        <div className="wiz-checklist">
          {STEPS.map((label, idx) => {
            const n = idx + 1;
            const state = n < step ? 'done' : n === step ? 'current' : 'todo';
            return (
              <div key={label} className={`wiz-check-item ${state}`}>
                <span className="wiz-check-dot">
                  {state === 'done'    ? <Check size={13}  /> :
                   state === 'current' ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#01b88e', display: 'inline-block' }} /> :
                   <Circle size={13} />}
                </span>
                {label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right content */}
      <div className="wiz-content">
        <div className="wiz-panel">
          <div className="wiz-progress">
            <div className="wiz-progress-fill" style={{ width: progress }} />
          </div>

          <h2 className="wiz-panel-title">
            {['Name your workspace', 'What industry are you in?', 'Framework & locale',
              'Risk matrix & scoring bands', 'Name 3 risk categories', 'Invite your team'][step - 1]}
          </h2>
          <p className="wiz-panel-sub">
            {[
              'You can change any of this later in Settings.',
              'Sets your default risk framework and AI tone.',
              'Confirm or adjust — these apply across your whole workspace.',
              'Severity = Likelihood × Impact. Fully editable in Settings after launch.',
              'Pick any 3 that matter most right now. Add the rest later in Settings.',
              'Optional — you can always add people later from Settings.',
            ][step - 1]}
          </p>

          {error && <div className="wiz-error">{error}</div>}

          {loading && (
            <div style={{ margin: '0.5rem 0 1.25rem' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#01b88e', marginBottom: 8 }}>
                {launchSteps[launchStep]}
              </p>
              <div className="wiz-progress" style={{ marginBottom: 0 }}>
                <div
                  className="wiz-progress-fill"
                  style={{ width: `${Math.min((launchStep / (launchSteps.length - 1)) * 95, 95)}%` }}
                />
              </div>
            </div>
          )}

          {step === 1 && <StepWorkspace  data={data} onChange={patch} />}
          {step === 2 && <StepIndustry   data={data} onChange={patch} />}
          {step === 3 && <StepFramework  data={data} onChange={patch} />}
          {step === 4 && <StepMatrix />}
          {step === 5 && <StepCategories data={data} onChange={patch} />}
          {step === 6 && <StepInvite     data={data} onChange={patch} />}

          <div className="wiz-footer">
            {step === 1
              ? <span />
              : <button type="button" className="wiz-btn" onClick={() => setStep(s => s - 1)}>
                  Back
                </button>
            }

            {step < 6
              ? <button
                  type="button"
                  className="wiz-btn wiz-btn-primary"
                  disabled={!canAdvance()}
                  onClick={() => setStep(s => s + 1)}
                >
                  Continue
                </button>
              : <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <button type="button" className="wiz-btn-ghost" disabled={loading} onClick={handleLaunch}>
                    Skip invites
                  </button>
                  <button
                    type="button"
                    className="wiz-btn wiz-btn-launch"
                    disabled={loading}
                    onClick={handleLaunch}
                  >
                    {!loading && <Rocket size={15} />}
                    {loading ? launchSteps[launchStep] : 'Launch workspace'}
                  </button>
                </div>
            }
          </div>
        </div>
      </div>
    </div>
  );
}