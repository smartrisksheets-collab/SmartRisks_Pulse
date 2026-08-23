// src/pages/Settings.tsx

import { useState } from "react";
import { useSettings } from "../hooks/useSettings";
import { useAuthStore } from "../store/authStore";
import UnsavedBanner from "../components/settings/UnsavedBanner";
import { useSendTestBrief } from "../hooks/useBrief";
import type { SettingsData, SettingsUpdate } from "../types/settings";
import WorkspaceSettings from "../components/settings/WorkspaceSettings";
import LookupEditor from "../components/settings/LookupEditor";
import NotificationPrefs from "../components/settings/NotificationPrefs";
import MatrixSettings from "../components/settings/MatrixSettings";

// ── AI Policy Builder — module-scope constants ───────────────────────────

const INDUSTRY_OPTIONS = [
  'Finance', 'Healthcare', 'Oil & Gas', 'Manufacturing',
  'Technology', 'Government', 'Energy', 'Retail', 'Education',
];

const TONE_OPTIONS = [
  { value: 'executive',      label: 'Executive'      },
  { value: 'technical',      label: 'Technical'      },
  { value: 'regulatory',     label: 'Regulatory'     },
  { value: 'plain-language', label: 'Plain Language' },
];

const SENSITIVITY_OPTIONS = [
  { key: 'no-names',       label: 'Avoid naming individuals',  clause: 'Avoid naming specific individuals.'           },
  { key: 'no-financials',  label: 'No financial figures',      clause: 'Do not reference specific financial figures.' },
  { key: 'no-departments', label: 'Omit department names',     clause: 'Omit specific team or department names.'      },
  { key: 'no-regulatory',  label: 'No regulatory references',  clause: 'Avoid citing specific regulatory references.' },
];

const TONE_CLAUSES: Record<string, string> = {
  'executive':      'Write in an executive tone. Use strategic language appropriate for senior leadership.',
  'technical':      'Write in a technical tone. Be precise, detailed, and terminology-aware.',
  'regulatory':     'Write in a regulatory tone. Use compliance-focused, formal language.',
  'plain-language': 'Write in plain language. Avoid jargon and keep explanations simple.',
};

interface PolicyConfig {
  industry:    string;
  tone:        string;
  toneCustom:  string;
  sensitivity: string[];
  extra:       string;
}

function assemblePolicy(cfg: PolicyConfig, wsIndustry: string): string {
  const parts: string[] = [];
  const industry = cfg.industry === 'auto'
    ? wsIndustry
    : cfg.industry === 'other-placeholder' || cfg.industry === ''
      ? ''
      : cfg.industry;
  if (industry) parts.push(`Frame all analysis in the context of the ${industry} sector.`);
  const toneClause = cfg.tone === 'other'
    ? cfg.toneCustom
    : TONE_CLAUSES[cfg.tone] ?? '';
  if (toneClause) parts.push(toneClause);
  for (const flag of cfg.sensitivity) {
    const opt = SENSITIVITY_OPTIONS.find((o) => o.key === flag);
    if (opt) parts.push(opt.clause);
  }
  if (cfg.extra.trim()) parts.push(cfg.extra.trim());
  return parts.join('\n');
}

// ── module-scope tab sub-components ─────────────────────────────────────
// Each calls useSettings() directly. TanStack Query deduplicates the cache.
// useState initial values are set once on mount, after the page-level
// loading gate ensures query.data is available.

function RolesTab() {
  const { query, update } = useSettings();
  const s = query.data as SettingsData;

  const [form, setForm] = useState<SettingsUpdate>({
    roles_default_role: s.roles_default_role,
    roles_access_mode:  s.roles_access_mode,
    perm_owner_risks:   s.perm_owner_risks,
    perm_mgr_risks:     s.perm_mgr_risks,
    perm_analyst_risks: s.perm_analyst_risks,
    perm_owner_inc:     s.perm_owner_inc,
    perm_mgr_inc:       s.perm_mgr_inc,
    perm_analyst_inc:   s.perm_analyst_inc,
    perm_owner_ai:      s.perm_owner_ai,
    perm_mgr_ai:        s.perm_mgr_ai,
    perm_analyst_ai:    s.perm_analyst_ai,
    perm_owner_print:   s.perm_owner_print,
    perm_mgr_print:     s.perm_mgr_print,
    perm_analyst_print: s.perm_analyst_print,
    perm_owner_users:   s.perm_owner_users,
    perm_mgr_users:     s.perm_mgr_users,
    perm_analyst_users: s.perm_analyst_users,
  });
  const [msg, setMsg] = useState("");

  const isDirty =
    form.roles_default_role !== s.roles_default_role ||
    form.roles_access_mode  !== s.roles_access_mode  ||
    form.perm_owner_risks   !== s.perm_owner_risks   ||
    form.perm_mgr_risks     !== s.perm_mgr_risks     ||
    form.perm_analyst_risks !== s.perm_analyst_risks ||
    form.perm_owner_inc     !== s.perm_owner_inc     ||
    form.perm_mgr_inc       !== s.perm_mgr_inc       ||
    form.perm_analyst_inc   !== s.perm_analyst_inc   ||
    form.perm_owner_ai      !== s.perm_owner_ai      ||
    form.perm_mgr_ai        !== s.perm_mgr_ai        ||
    form.perm_analyst_ai    !== s.perm_analyst_ai    ||
    form.perm_owner_print   !== s.perm_owner_print   ||
    form.perm_mgr_print     !== s.perm_mgr_print     ||
    form.perm_analyst_print !== s.perm_analyst_print ||
    form.perm_owner_users   !== s.perm_owner_users   ||
    form.perm_mgr_users     !== s.perm_mgr_users     ||
    form.perm_analyst_users !== s.perm_analyst_users;

  function check(key: keyof SettingsUpdate, value: boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSave() {
    setMsg("");
    update.mutate(form, {
      onSuccess: () => setMsg("Role settings saved."),
      onError:   () => setMsg("Save failed. Please try again."),
    });
  }

  const PERMS: Array<{ label: string; sub: string; owner: keyof SettingsUpdate; mgr: keyof SettingsUpdate; analyst: keyof SettingsUpdate }> = [
    { label: "Manage Risks",     sub: "Add/Edit/Delete",      owner: "perm_owner_risks",   mgr: "perm_mgr_risks",   analyst: "perm_analyst_risks"   },
    { label: "Manage Incidents", sub: "Review/Resolve",       owner: "perm_owner_inc",     mgr: "perm_mgr_inc",     analyst: "perm_analyst_inc"     },
    { label: "Generate AI",      sub: "Insights + summaries", owner: "perm_owner_ai",      mgr: "perm_mgr_ai",      analyst: "perm_analyst_ai"      },
    { label: "Print Reports",    sub: "",                     owner: "perm_owner_print",   mgr: "perm_mgr_print",   analyst: "perm_analyst_print"   },
    { label: "Manage Users",     sub: "Add/Deactivate",       owner: "perm_owner_users",   mgr: "perm_mgr_users",   analyst: "perm_analyst_users"   },
  ];

  return (
    <div className="settings-section">
      {isDirty && <UnsavedBanner onSave={handleSave} saving={update.isPending} />}
      <div className="settings-title">Role Permissions</div>
      <p className="muted small">Control what each role can do inside the workspace.</p>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 180 }}>Permission</th>
              <th>Admin</th>
              <th>Manager</th>
              <th>Analyst</th>
            </tr>
          </thead>
          <tbody>
            {PERMS.map((p) => (
              <tr key={p.label}>
                <td>
                  <strong>{p.label}</strong>
                  {p.sub && <div className="muted small">{p.sub}</div>}
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!form[p.owner]}
                    onChange={(e) => check(p.owner, e.target.checked)}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!form[p.mgr]}
                    onChange={(e) => check(p.mgr, e.target.checked)}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!form[p.analyst]}
                    onChange={(e) => check(p.analyst, e.target.checked)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row2" style={{ marginTop: 14 }}>
        <div className="field">
          <label>Default Role for New Users</label>
          <select
            value={form.roles_default_role ?? "Analyst"}
            onChange={(e) => setForm((f) => ({ ...f, roles_default_role: e.target.value }))}
          >
            <option value="Analyst">Analyst</option>
            <option value="Manager">Manager</option>
            <option value="Owner">Admin</option>
          </select>
        </div>
        <div className="field">
          <label>Access Mode</label>
          <select
            value={form.roles_access_mode ?? "internal"}
            onChange={(e) => setForm((f) => ({ ...f, roles_access_mode: e.target.value }))}
          >
            <option value="internal">Only users in Users tab can access</option>
            <option value="any">Any invited user</option>
          </select>
        </div>
      </div>

      {msg && (
        <p style={{ fontSize: 13, color: msg.includes("failed") ? "#ef4444" : "#01b88e", marginTop: 8 }}>
          {msg}
        </p>
      )}

      <div className="settings-actions">
        <button className="btn btn-primary" type="button" onClick={handleSave} disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save Roles"}
        </button>
      </div>
    </div>
  );
}

function AITab() {
  const { query, update } = useSettings();
  const s       = query.data as SettingsData;
  const modules = useAuthStore(s => s.claims?.modules ?? []);
  const hasRisk = modules.includes('risk');

  const [form, setForm] = useState<SettingsUpdate>({
    ai_enabled:    s.ai_enabled,
    ai_model:      s.ai_model,
    ai_confidence: s.ai_confidence,
    ai_auto_run:   s.ai_auto_run,
  });

  const [policyConfig, setPolicyConfig] = useState<PolicyConfig>({
    industry:    s.ai_policy_industry    || 'auto',
    tone:        s.ai_policy_tone        || '',
    toneCustom:  '',
    sensitivity: s.ai_policy_sensitivity ? s.ai_policy_sensitivity.split(',').filter(Boolean) : [],
    extra:       s.ai_policy_extra       || '',
  });

  const [showPreview, setShowPreview] = useState(false);
  const [msg, setMsg] = useState('');

  const assembled = assemblePolicy(policyConfig, s.industry ?? '');

  const isDirty =
    form.ai_enabled    !== s.ai_enabled    ||
    form.ai_model      !== s.ai_model      ||
    form.ai_confidence !== s.ai_confidence ||
    form.ai_auto_run   !== s.ai_auto_run   ||
    assembled          !== (s.ai_policy ?? '');

  function field(key: keyof SettingsUpdate, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setIndustry(val: string) {
    setPolicyConfig((c) => ({ ...c, industry: val }));
  }

  function setTone(val: string) {
    setPolicyConfig((c) => ({ ...c, tone: val, toneCustom: val !== 'other' ? '' : c.toneCustom }));
  }

  function toggleSensitivity(key: string) {
    setPolicyConfig((c) => ({
      ...c,
      sensitivity: c.sensitivity.includes(key)
        ? c.sensitivity.filter((k) => k !== key)
        : [...c.sensitivity, key],
    }));
  }

  function handleSave() {
    setMsg('');
    update.mutate(
      {
        ...form,
        ai_policy:             assembled,
        ai_policy_industry:    policyConfig.industry,
        ai_policy_tone:        policyConfig.tone === 'other' ? policyConfig.toneCustom : policyConfig.tone,
        ai_policy_sensitivity: policyConfig.sensitivity.join(','),
        ai_policy_extra:       policyConfig.extra,
      },
      {
        onSuccess: () => setMsg('AI settings saved.'),
        onError:   () => setMsg('Save failed. Please try again.'),
      },
    );
  }

  const isIndustryOther = policyConfig.industry !== 'auto' && !INDUSTRY_OPTIONS.includes(policyConfig.industry) && policyConfig.industry !== '';

  return (
    <>
      <div className="settings-section">
        {isDirty && <UnsavedBanner onSave={handleSave} saving={update.isPending} />}
        <div className="settings-title">AI Controls</div>
        <p className="muted small">Tune SmartRisk AI behavior and guardrails.</p>

        <div className="row2">
          <div className="field">
            <label>AI Enabled</label>
            <select value={form.ai_enabled ?? 'on'} onChange={(e) => field('ai_enabled', e.target.value)}>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </div>
          <div className="field">
            <label>Model</label>
            <select value={form.ai_model ?? 'claude-sonnet-4-6'} onChange={(e) => field('ai_model', e.target.value)}>
              <option value="claude-sonnet-4-6">Full Analysis — deeper insights, richer narratives</option>
              <option value="claude-haiku-4-5-20251001">Quick Scan — faster responses, concise output</option>
            </select>
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <label>Confidence Level</label>
            <select value={form.ai_confidence ?? 'balanced'} onChange={(e) => field('ai_confidence', e.target.value)}>
              <option value="conservative">Conservative (safer, less bold)</option>
              <option value="balanced">Balanced</option>
              <option value="assertive">Assertive (more direct)</option>
            </select>
          </div>
          {hasRisk && (
            <div className="field">
              <label>Auto-run AI on New Risk</label>
              <select value={form.ai_auto_run ?? 'no'} onChange={(e) => field('ai_auto_run', e.target.value)}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="settings-section" style={{ marginTop: 24 }}>
        <div className="settings-title">Prompt Policy</div>
        <p className="muted small">Configure how AI frames its analysis across the entire workspace. These instructions apply to every AI call.</p>

        {/* Industry context */}
        <div style={{ marginBottom: 18 }}>
          <span className="mx-preset-label">INDUSTRY CONTEXT</span>
          <div className="mx-presets" style={{ marginTop: 6, marginBottom: 0 }}>
            <button
              type="button"
              className={`mx-chip${policyConfig.industry === 'auto' ? ' active' : ''}`}
              onClick={() => setIndustry('auto')}
            >
              Use workspace default{s.industry ? ` (${s.industry})` : ''}
            </button>
            {INDUSTRY_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`mx-chip${policyConfig.industry === opt ? ' active' : ''}`}
                onClick={() => setIndustry(opt)}
              >
                {opt}
              </button>
            ))}
            <button
              type="button"
              className={`mx-chip${isIndustryOther ? ' active' : ''}`}
              onClick={() => setIndustry(isIndustryOther ? policyConfig.industry : 'other-placeholder')}
            >
              Other
            </button>
          </div>
          {(isIndustryOther || policyConfig.industry === 'other-placeholder') && (
            <div className="field" style={{ marginTop: 8, maxWidth: 280 }}>
              <input
                placeholder="e.g. Logistics, Mining, Telecoms…"
                value={policyConfig.industry === 'other-placeholder' ? '' : policyConfig.industry}
                onChange={(e) => setIndustry(e.target.value || 'other-placeholder')}
              />
            </div>
          )}
        </div>

        {/* Tone */}
        <div style={{ marginBottom: 18 }}>
          <span className="mx-preset-label">AI TONE</span>
          <div className="mx-presets" style={{ marginTop: 6, marginBottom: 0 }}>
            {TONE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`mx-chip${policyConfig.tone === opt.value ? ' active' : ''}`}
                onClick={() => setTone(policyConfig.tone === opt.value ? '' : opt.value)}
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              className={`mx-chip${policyConfig.tone === 'other' ? ' active' : ''}`}
              onClick={() => setTone(policyConfig.tone === 'other' ? '' : 'other')}
            >
              Other
            </button>
          </div>
          {policyConfig.tone === 'other' && (
            <div className="field" style={{ marginTop: 8, maxWidth: 340 }}>
              <input
                placeholder="Describe the tone you want the AI to use…"
                value={policyConfig.toneCustom}
                onChange={(e) => setPolicyConfig((c) => ({ ...c, toneCustom: e.target.value }))}
              />
            </div>
          )}
        </div>

        {/* Sensitivity guardrails */}
        <div style={{ marginBottom: 18 }}>
          <span className="mx-preset-label">SENSITIVITY GUARDRAILS</span>
          <div className="mx-presets" style={{ marginTop: 6, marginBottom: 0 }}>
            {SENSITIVITY_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`mx-chip${policyConfig.sensitivity.includes(opt.key) ? ' active' : ''}`}
                onClick={() => toggleSensitivity(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Additional instructions */}
        <div className="field">
          <label>Additional Instructions</label>
          <textarea
            rows={3}
            placeholder="Any extra instructions appended to the policy…"
            value={policyConfig.extra}
            onChange={(e) => setPolicyConfig((c) => ({ ...c, extra: e.target.value }))}
          />
        </div>

        {/* Preview toggle */}
        <button type="button" className="ap-preview-toggle" onClick={() => setShowPreview((v) => !v)}>
          <span>{showPreview ? '▲' : '▼'}</span>
          {showPreview ? 'Hide policy preview' : 'Preview policy'}
        </button>
        {showPreview && (
          <div className="ap-preview-body">
            {assembled || <span style={{ fontStyle: 'italic' }}>No policy configured. Select options above to build one.</span>}
          </div>
        )}

        {msg && (
          <p style={{ fontSize: 13, color: msg.includes('failed') ? '#ef4444' : '#01b88e', marginTop: 10 }}>
            {msg}
          </p>
        )}

        <div className="settings-actions">
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save AI Settings'}
          </button>
        </div>
      </div>
    </>
  );
}


function BriefTab() {
  const { query, update } = useSettings();
  const sendTest          = useSendTestBrief();
  const s = query.data as SettingsData;

  const [testEmail, setTestEmail] = useState("");
  const [testMsg,   setTestMsg]   = useState("");

  function handleSendTest() {
    if (!testEmail.trim()) return;
    setTestMsg("");
    sendTest.mutate(
      { to_email: testEmail.trim() },
      {
        onSuccess: (res) => {
          if (res.ok) setTestMsg("Test brief sent. Check your inbox.");
          else setTestMsg(res.reason || "Send failed.");
        },
        onError: () => setTestMsg("Send failed. Check brief settings and recipients."),
      }
    );
  }

  const [form, setForm] = useState<SettingsUpdate>({
    brief_enabled:          s.brief_enabled,
    brief_send_time:        s.brief_send_time,
    brief_recipients:       s.brief_recipients,
    brief_weekly_enabled:   s.brief_weekly_enabled,
    brief_monthly_enabled:  s.brief_monthly_enabled,
    brief_quarterly_enabled: s.brief_quarterly_enabled,
    brief_stale_threshold:  s.brief_stale_threshold,
    brief_testing_interval: s.brief_testing_interval,
    brief_outreach_cap:     s.brief_outreach_cap,
  });
  const [msg, setMsg] = useState("");

  const isDirty =
    form.brief_enabled            !== s.brief_enabled            ||
    form.brief_send_time          !== s.brief_send_time          ||
    form.brief_recipients         !== s.brief_recipients         ||
    form.brief_weekly_enabled     !== s.brief_weekly_enabled     ||
    form.brief_monthly_enabled    !== s.brief_monthly_enabled    ||
    form.brief_quarterly_enabled  !== s.brief_quarterly_enabled  ||
    form.brief_stale_threshold    !== s.brief_stale_threshold    ||
    form.brief_testing_interval   !== s.brief_testing_interval   ||
    form.brief_outreach_cap       !== s.brief_outreach_cap;

  function field(key: keyof SettingsUpdate, value: string | number | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSave() {
    setMsg("");
    update.mutate(form, {
      onSuccess: () => setMsg("Brief settings saved."),
      onError:   () => setMsg("Save failed. Please try again."),
    });
  }

  return (
    <>
      <div className="settings-section">
        {isDirty && <UnsavedBanner onSave={handleSave} saving={update.isPending} />}
        <div className="settings-title">Risk Brief</div>
        <p className="muted small">
          A daily email digest of what changed in your register, band crossings, control failures, stale records, and owner nudges.
        </p>

        <div className="row2" style={{ marginTop: 16 }}>
          <div className="field">
            <label>Brief Status</label>
            <select
              value={form.brief_enabled ?? "off"}
              onChange={(e) => field("brief_enabled", e.target.value)}
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
          </div>
          <div className="field">
            <label>Send Time</label>
            <select
              value={form.brief_send_time ?? "08:00"}
              onChange={(e) => field("brief_send_time", e.target.value)}
            >
              <option value="07:00">7:00 AM</option>
              <option value="08:00">8:00 AM</option>
              <option value="09:00">9:00 AM</option>
              <option value="10:00">10:00 AM</option>
            </select>
          </div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Recipients</label>
          <input
            type="text"
            placeholder="ceo@company.com, risk@company.com"
            value={form.brief_recipients ?? ""}
            onChange={(e) => field("brief_recipients", e.target.value)}
          />
          <p className="muted small" style={{ marginTop: 4 }}>
            Comma-separated. First address is used for personalisation.
          </p>
        </div>
      </div>

      <div className="settings-section" style={{ marginTop: 24 }}>
        <div className="settings-title">Cadence</div>
        <p className="muted small">Daily exception feed always runs. Toggle heavier digests on or off below.</p>

        <div className="row2">
          <div className="field">
            <label>Weekly Digest (Mondays)</label>
            <select
              value={form.brief_weekly_enabled ? "true" : "false"}
              onChange={(e) => field("brief_weekly_enabled", e.target.value === "true")}
            >
              <option value="true">On</option>
              <option value="false">Off</option>
            </select>
          </div>
          <div className="field">
            <label>Monthly Posture (1st business day)</label>
            <select
              value={form.brief_monthly_enabled ? "true" : "false"}
              onChange={(e) => field("brief_monthly_enabled", e.target.value === "true")}
            >
              <option value="true">On</option>
              <option value="false">Off</option>
            </select>
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <label>Quarterly Board Summary</label>
            <select
              value={form.brief_quarterly_enabled ? "true" : "false"}
              onChange={(e) => field("brief_quarterly_enabled", e.target.value === "true")}
            >
              <option value="true">On</option>
              <option value="false">Off</option>
            </select>
          </div>
          <div className="field" />
        </div>
      </div>

      <div className="settings-section" style={{ marginTop: 24 }}>
        <div className="settings-title">Thresholds</div>
        <p className="muted small">Tune when items surface in the brief. Values are in days.</p>

        <div className="row2">
          <div className="field">
            <label>Staleness Threshold (days)</label>
            <input
              type="number"
              min={7}
              max={180}
              value={form.brief_stale_threshold ?? 30}
              onChange={(e) => field("brief_stale_threshold", Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Control Testing Interval (days)</label>
            <input
              type="number"
              min={30}
              max={365}
              value={form.brief_testing_interval ?? 90}
              onChange={(e) => field("brief_testing_interval", Number(e.target.value))}
            />
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <label>Max Outreach Items per Brief</label>
            <input
              type="number"
              min={1}
              max={10}
              value={form.brief_outreach_cap ?? 5}
              onChange={(e) => field("brief_outreach_cap", Number(e.target.value))}
            />
          </div>
          <div className="field" />
        </div>

        {msg && (
          <p style={{ fontSize: 13, color: msg.includes("failed") ? "#ef4444" : "#01b88e", marginTop: 8 }}>
            {msg}
          </p>
        )}

        <div className="settings-actions">
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save Brief Settings"}
          </button>
        </div>
      </div>

      <div className="settings-section" style={{ marginTop: 24 }}>
        <div className="settings-title">Send Test Brief</div>
        <p className="muted small">
          Send a test brief to any address to preview the current workspace output. Brief settings must be saved before testing.
        </p>
        <div className="row2" style={{ alignItems: "flex-end", marginTop: 14 }}>
          <div className="field">
            <label>Recipient Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <button
              className="btn btn-primary"
              type="button"
              onClick={handleSendTest}
              disabled={sendTest.isPending || !testEmail.trim()}
              style={{ marginTop: 22 }}
            >
              {sendTest.isPending ? "Sending…" : "Send Test Brief"}
            </button>
          </div>
        </div>
        {testMsg && (
          <p style={{ fontSize: 13, color: testMsg.includes("sent") ? "#01b88e" : "#ef4444", marginTop: 8 }}>
            {testMsg}
          </p>
        )}
      </div>

      <div className="settings-section" style={{ marginTop: 24 }}>
        <NotificationPrefs />
      </div>
    </>
  );
}

function BillingTab() {
  const { query } = useSettings();
  const s = query.data as SettingsData;

  const expiryLabel = s.plan_expires_at
    ? new Date(s.plan_expires_at).toLocaleDateString()
    : "N/A";

  return (
    <div className="settings-section">
      <div className="settings-title">License & Plan</div>
      <p className="muted small">View your subscription and workspace limits.</p>

      <div className="row2">
        <div className="field">
          <label>Plan</label>
          <input type="text" value={s.plan} disabled />
        </div>
        <div className="field">
          <label>Expires</label>
          <input type="text" value={expiryLabel} disabled />
        </div>
      </div>

      <div className="row2">
        <div className="field">
          <label>Risk Limit</label>
          <input type="text" value={s.max_risks.toLocaleString()} disabled />
        </div>
        <div className="field">
          <label>User Limit</label>
          <input type="text" value={s.max_users.toLocaleString()} disabled />
        </div>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label>Modules</label>
        <input type="text" value={s.modules.join(", ")} disabled />
      </div>

      <p className="muted small" style={{ marginTop: 14 }}>
        To change your plan, contact support.
      </p>
    </div>
  );
}

// ── Tab definitions ──────────────────────────────────────────────────────
const TABS = [
  { id: "ws",     label: "Workspace",       icon: "building-2"  },
  { id: "matrix", label: "Risk Matrix",     icon: "grid-2x2"    },
  { id: "tax",    label: "Risk Config",     icon: "tags"        },
  { id: "roles",  label: "Users & Roles",   icon: "users"       },
  { id: "ai",     label: "AI & Automation", icon: "sparkles"    },
  { id: "brief",  label: "Risk Brief",      icon: "mail"        },
  { id: "bill",   label: "Billing",         icon: "badge-check" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── Main Settings page ───────────────────────────────────────────────────
export default function Settings() {
  const { query } = useSettings();
  const [activeTab, setActiveTab] = useState<TabId>("ws");

  if (query.isLoading) {
    return (
      <div className="page">
        <h1 className="page-title">Settings</h1>
        <p className="muted small">Loading…</p>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="page">
        <h1 className="page-title">Settings</h1>
        <p style={{ color: "#ef4444", fontSize: 14 }}>Failed to load settings. Refresh the page.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Settings</h1>
        <div className="crumbs">Manage workspace configuration, governance, and behavior</div>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 20 }}>
        {/* Tab bar */}
        <div className="settings-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab${activeTab === t.id ? " active" : ""}`}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
            >
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Tab panels — CSS-driven visibility preserves form state across tab switches */}
        <div className="settings-panels">
          <div className={`tab-panel${activeTab === "ws" ? " active" : ""}`}>
            <WorkspaceSettings settings={query.data} />
          </div>
          <div className={`tab-panel${activeTab === "matrix" ? " active" : ""}`}>
            <MatrixSettings />
          </div>
          <div className={`tab-panel${activeTab === "tax" ? " active" : ""}`}>
            <LookupEditor />
          </div>
          <div className={`tab-panel${activeTab === "roles" ? " active" : ""}`}>
            <RolesTab />
          </div>
          <div className={`tab-panel${activeTab === "ai" ? " active" : ""}`}>
            <AITab />
          </div>
          <div className={`tab-panel${activeTab === "brief" ? " active" : ""}`}>
            <BriefTab />
          </div>
          <div className={`tab-panel${activeTab === "bill" ? " active" : ""}`}>
            <BillingTab />
          </div>
        </div>
      </div>
    </div>
  );
}