// src/components/settings/IncidentSeveritySettings.tsx

import { useState } from 'react';
import { useIncidentSeverity } from '../../hooks/useIncidentSeverity';
import UnsavedBanner from './UnsavedBanner';

// ── Module-level constants ───────────────────────────────────────────────────

const NOTIFY_OPTIONS = [
  { value: 'admin_and_owner', label: 'Admin + Owner immediately' },
  { value: 'owner_only',      label: 'Incident owner only'       },
  { value: 'none',            label: 'No notification'           },
] as const;

const ESCALATE_OPTIONS = [
  { value: 'risk_committee', label: 'Risk Committee' },
  { value: 'cro',            label: 'CRO'            },
  { value: 'admin',          label: 'Admin'          },
] as const;

const DEFAULT_COLORS = ['#c0392b', '#b7791f', '#0e8f6f', '#64748b', '#2451c9'];

// ── Interfaces ───────────────────────────────────────────────────────────────

interface LevelDraft {
  id?: string;
  label: string;
  color: string;
  criteria_text: string;
}

interface SlaDraft {
  target_value:  number;
  target_unit:   'hours' | 'days';
  notify_on_log: string;
}

interface EscalationDraft {
  auto_escalate_on_breach:  boolean;
  escalate_to:              string;
  flag_unowned_after_hours: number | null;
}

interface ReassignState {
  levelId:    string;
  label:      string;
  count:      number;
  reassignTo: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function IncidentSeveritySettings() {
  const { config, preview, saveConfig, deleteLevel } = useIncidentSeverity();

  const [levels,      setLevels]      = useState<LevelDraft[]>([]);
  const [sla,         setSla]         = useState<SlaDraft[]>([]);
  const [escalation,  setEscalation]  = useState<EscalationDraft>({
    auto_escalate_on_breach:  false,
    escalate_to:              'admin',
    flag_unowned_after_hours: 48,
  });
  const [initialized, setInitialized] = useState(false);
  const [isDirty,     setIsDirty]     = useState(false);
  const [msg,         setMsg]         = useState('');
  const [reassign,    setReassign]    = useState<ReassignState | null>(null);

  // Initialize local state from query once
  if (config.data && !initialized) {
    const sorted = [...config.data.levels].sort((a, b) => a.sort_order - b.sort_order);
    setLevels(sorted.map(l => ({
      id:           l.id,
      label:        l.label,
      color:        l.color,
      criteria_text: l.criteria_text ?? '',
    })));

    const slaById: Record<string, typeof config.data.sla_targets[0]> = {};
    for (const t of config.data.sla_targets) slaById[t.severity_id] = t;

    setSla(sorted.map(l => {
      const t = slaById[l.id];
      return {
        target_value:  t?.target_value  ?? 24,
        target_unit:   (t?.target_unit  ?? 'hours') as 'hours' | 'days',
        notify_on_log: t?.notify_on_log ?? 'none',
      };
    }));

    const rules = config.data.escalation_rules;
    if (rules) {
      setEscalation({
        auto_escalate_on_breach:  rules.auto_escalate_on_breach,
        escalate_to:              rules.escalate_to,
        flag_unowned_after_hours: rules.flag_unowned_after_hours,
      });
    }

    setInitialized(true);
  }

  function markDirty() { setIsDirty(true); setMsg(''); }

  // Level handlers
  function handleLevelChange(i: number, field: keyof LevelDraft, value: string) {
    setLevels(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
    markDirty();
  }

  function handleAddLevel() {
    const color = DEFAULT_COLORS[levels.length % DEFAULT_COLORS.length];
    setLevels(prev => [...prev, { label: '', color, criteria_text: '' }]);
    setSla(prev => [...prev, { target_value: 24, target_unit: 'hours', notify_on_log: 'none' }]);
    markDirty();
  }

  function handleDeleteLevel(i: number) {
    const level = levels[i];
    if (levels.length <= 1) { setMsg('Cannot delete the last severity level.'); return; }

    // Unsaved level: remove from local state only
    if (!level.id) {
      setLevels(prev => prev.filter((_, idx) => idx !== i));
      setSla(prev => prev.filter((_, idx) => idx !== i));
      return;
    }

    deleteLevel.mutate(
      { levelId: level.id },
      {
        onSuccess: () => setInitialized(false),
        onError: (e) => {
          const errMsg = e instanceof Error ? e.message : '';
          if (errMsg.includes('reassign_to')) {
            const match  = errMsg.match(/^(\d+)/);
            const count  = match ? parseInt(match[1], 10) : 1;
            const others = levels.filter((_, idx) => idx !== i);
            setReassign({
              levelId:    level.id!,
              label:      level.label,
              count,
              reassignTo: others.find(l => l.id)?.id ?? '',
            });
          } else {
            setMsg(errMsg || 'Delete failed.');
          }
        },
      },
    );
  }

  function handleConfirmReassign() {
    if (!reassign?.reassignTo) return;
    deleteLevel.mutate(
      { levelId: reassign.levelId, reassignTo: reassign.reassignTo },
      {
        onSuccess: () => { setReassign(null); setInitialized(false); },
        onError:   (e) => { setMsg(e instanceof Error ? e.message : 'Reassignment failed.'); setReassign(null); },
      },
    );
  }

  // SLA handlers
  function handleSlaChange(i: number, field: keyof SlaDraft, value: string | number) {
    setSla(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
    markDirty();
  }

  // Escalation handlers
  function handleEscChange(
    field: keyof EscalationDraft,
    value: boolean | string | number | null,
  ) {
    setEscalation(prev => ({ ...prev, [field]: value }));
    markDirty();
  }

  function handleSave() {
    const emptyLevel = levels.find(l => !l.label.trim());
    if (emptyLevel !== undefined) { setMsg('All severity levels must have a label.'); return; }
    const badSla = sla.find(s => !s.target_value || s.target_value <= 0);
    if (badSla !== undefined) { setMsg('All SLA targets must be greater than zero.'); return; }

    setMsg('');
    saveConfig.mutate(
      {
        levels: levels.map((l, i) => ({
          id:           l.id,
          label:        l.label.trim(),
          sort_order:   i + 1,
          color:        l.color,
          criteria_text: l.criteria_text.trim() || undefined,
        })),
        slaByIndex: sla.map(s => ({
          target_value:  s.target_value,
          target_unit:   s.target_unit,
          notify_on_log: s.notify_on_log === 'none' ? null : s.notify_on_log,
        })),
        escalation,
      },
      {
        onSuccess: () => { setMsg('Configuration saved.'); setIsDirty(false); setInitialized(false); },
        onError:   (e) => setMsg(e instanceof Error ? e.message : 'Save failed.'),
      },
    );
  }

  function handleReset() { setInitialized(false); setIsDirty(false); setMsg(''); }

  if (config.isLoading) return <p className="muted small">Loading…</p>;
  if (config.isError)   return <p style={{ color: '#ef4444', fontSize: 13 }}>Failed to load incident severity configuration.</p>;

  const bandMap  = config.data?.band_map ?? [];
  const allLevels = config.data?.levels  ?? [];

  return (
    <div>
      {isDirty && <UnsavedBanner onSave={handleSave} saving={saveConfig.isPending} />}

      <div className="sev-cfg-grid">

        {/* LEFT: configuration cards */}
        <div>

          {/* Card 1: Severity levels */}
          <div className="settings-section" style={{ marginBottom: 14 }}>
            <div className="mx-card-header">
              <span className="mx-card-num">1</span>
              <span className="mx-card-title">Severity levels</span>
            </div>
            <p className="mx-card-desc">
              Define the severity scale for this workspace. Order here sets display and escalation priority, highest severity first.
            </p>

            {levels.map((level, i) => (
              <div key={level.id ?? `new-${i}`} className="sev-row">
                <input
                  type="color"
                  value={level.color}
                  className="sev-color-input"
                  title="Level color"
                  onChange={(e) => handleLevelChange(i, 'color', e.target.value)}
                />
                <input
                  className="sev-label-input"
                  placeholder="Level name"
                  value={level.label}
                  onChange={(e) => handleLevelChange(i, 'label', e.target.value)}
                />
                <input
                  className="sev-criteria-input"
                  placeholder="Criteria shown when logging an incident (optional)"
                  value={level.criteria_text}
                  onChange={(e) => handleLevelChange(i, 'criteria_text', e.target.value)}
                />
                <button
                  type="button"
                  className="sev-del-btn"
                  onClick={() => handleDeleteLevel(i)}
                  title="Delete level"
                >
                  ✕
                </button>
              </div>
            ))}

            {reassign && (
              <div className="sev-reassign-panel">
                <p className="sev-reassign-msg">
                  <strong>{reassign.count}</strong> incident{reassign.count !== 1 ? 's' : ''} use
                  the <strong>{reassign.label}</strong> severity. Choose a replacement before deleting:
                </p>
                <div className="sev-reassign-row">
                  <select
                    className="sev-reassign-select"
                    value={reassign.reassignTo}
                    onChange={(e) => setReassign(r => r ? { ...r, reassignTo: e.target.value } : r)}
                  >
                    {levels
                      .filter(l => l.id && l.id !== reassign.levelId)
                      .map(l => (
                        <option key={l.id} value={l.id}>{l.label}</option>
                      ))
                    }
                  </select>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleConfirmReassign}
                    disabled={deleteLevel.isPending || !reassign.reassignTo}
                  >
                    {deleteLevel.isPending ? 'Reassigning…' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setReassign(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <button type="button" className="sev-add-row" onClick={handleAddLevel}>
              + Add a severity level
            </button>
          </div>

          {/* Card 2: SLA targets */}
          <div className="settings-section" style={{ marginBottom: 14 }}>
            <div className="mx-card-header">
              <span className="mx-card-num">2</span>
              <span className="mx-card-title">SLA targets</span>
            </div>
            <p className="mx-card-desc">
              Time to resolution per severity. Higher severities are typically set in hours, lower in days. Mixed units are supported.
            </p>

            {levels.map((level, i) => (
              <div key={level.id ?? `sla-${i}`} className="sla-row">
                <div className="sla-sev-name" style={{ color: level.color }}>
                  {level.label || <span className="muted">Unnamed</span>}
                </div>
                <div className="sla-in">
                  <input
                    type="number"
                    min={1}
                    className="sla-num"
                    value={sla[i]?.target_value ?? 24}
                    onChange={(e) => handleSlaChange(i, 'target_value', Number(e.target.value))}
                  />
                  <select
                    className="sla-unit"
                    value={sla[i]?.target_unit ?? 'hours'}
                    onChange={(e) => handleSlaChange(i, 'target_unit', e.target.value)}
                  >
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </div>
                <div className="sla-notify">
                  <select
                    value={sla[i]?.notify_on_log ?? 'none'}
                    onChange={(e) => handleSlaChange(i, 'notify_on_log', e.target.value)}
                  >
                    {NOTIFY_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          {/* Card 3: Escalation rules */}
          <div className="settings-section" style={{ marginBottom: 14 }}>
            <div className="mx-card-header">
              <span className="mx-card-num">3</span>
              <span className="mx-card-title">Escalation rules</span>
            </div>

            <div className="sev-tog-row">
              <button
                type="button"
                className={`sev-tog${escalation.auto_escalate_on_breach ? ' on' : ''}`}
                onClick={() => handleEscChange('auto_escalate_on_breach', !escalation.auto_escalate_on_breach)}
                aria-label="Toggle auto-escalate on breach"
              >
                <span className="sev-tog-knob" />
              </button>
              <div>
                <strong>Auto-escalate on SLA breach</strong>
                <p className="muted small" style={{ marginTop: 2 }}>
                  When an incident passes its SLA target unresolved, notify the next tier.
                </p>
                {escalation.auto_escalate_on_breach && (
                  <div className="field" style={{ marginTop: 8, maxWidth: 220 }}>
                    <select
                      value={escalation.escalate_to}
                      onChange={(e) => handleEscChange('escalate_to', e.target.value)}
                    >
                      {ESCALATE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="sev-tog-row">
              <button
                type="button"
                className={`sev-tog${escalation.flag_unowned_after_hours !== null ? ' on' : ''}`}
                onClick={() => handleEscChange(
                  'flag_unowned_after_hours',
                  escalation.flag_unowned_after_hours !== null ? null : 48,
                )}
                aria-label="Toggle flag unowned incidents"
              >
                <span className="sev-tog-knob" />
              </button>
              <div>
                <strong>Flag unowned incidents</strong>
                <p className="muted small" style={{ marginTop: 2 }}>
                  Surface incidents with no assigned owner in AI Insights for follow-up.
                </p>
                {escalation.flag_unowned_after_hours !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span className="muted small">After</span>
                    <input
                      type="number"
                      min={1}
                      className="sla-num"
                      value={escalation.flag_unowned_after_hours}
                      onChange={(e) => handleEscChange('flag_unowned_after_hours', Number(e.target.value))}
                    />
                    <span className="muted small">hours</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 4: Reference mapping (read-only) */}
          {allLevels.length > 0 && bandMap.length > 0 && (
            <div className="settings-section">
              <div className="mx-card-header">
                <span className="mx-card-num">4</span>
                <span className="mx-card-title">Reference mapping to Risk bands</span>
              </div>
              <p className="mx-card-desc">
                Used in reports for comparison only. This mapping does not feed any score calculation.
              </p>
              <table className="sev-map-table">
                <thead>
                  <tr>
                    <th>Incident severity</th>
                    <th></th>
                    <th>Comparable Risk band</th>
                  </tr>
                </thead>
                <tbody>
                  {allLevels.map(level => {
                    const map = bandMap.find(b => b.severity_id === level.id);
                    return (
                      <tr key={level.id}>
                        <td>
                          <span
                            className="sev-map-pill"
                            style={{ background: `${level.color}22`, color: level.color }}
                          >
                            {level.label}
                          </span>
                        </td>
                        <td className="muted small">→</td>
                        <td className="muted small">{map?.risk_band_label ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="muted small" style={{ marginTop: 10 }}>
                A recurring incident at the highest severity can be escalated into the Risk Register as a new risk.
              </p>
            </div>
          )}
        </div>

        {/* RIGHT: Live preview */}
        <div className="settings-section">
          <div className="mx-card-header">
            <span className="mx-card-num" style={{ background: 'rgba(1,184,142,.12)', color: 'var(--primary)' }}>✓</span>
            <span className="mx-card-title">Live preview</span>
          </div>
          <p className="mx-card-desc">
            Your 10 most recent open incidents evaluated against the SLA targets on this page.
          </p>

          {preview.isLoading && <p className="muted small">Loading preview…</p>}
          {preview.isError   && <p style={{ color: '#ef4444', fontSize: 13 }}>Preview unavailable.</p>}

          {preview.data && (
            <>
              <table className="sev-preview-table">
                <thead>
                  <tr>
                    <th>Incident</th>
                    <th>Severity</th>
                    <th>Age</th>
                    <th>Target</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.data.items.map(item => {
                    const ageDisp = item.age_hours >= 24
                      ? `${Math.round(item.age_hours / 24)}d`
                      : `${Math.round(item.age_hours)}h`;
                    const targetDisp = item.target_hours == null
                      ? '—'
                      : item.target_hours >= 24
                        ? `${Math.round(item.target_hours / 24)}d`
                        : `${Math.round(item.target_hours)}h`;
                    return (
                      <tr key={item.incident_id}>
                        <td style={{ fontWeight: 700 }}>{item.incident_id}</td>
                        <td>{item.severity}</td>
                        <td>{ageDisp}</td>
                        <td>{targetDisp}</td>
                        <td>
                          <span className={`sev-breach-pill ${item.is_breach ? 'sev-breach' : 'sev-within'}`}>
                            {item.is_breach ? 'Breach' : 'Within SLA'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {preview.data.items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted small" style={{ textAlign: 'center', padding: '16px 0' }}>
                        No open incidents to preview.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="sev-kpi-row">
                <div className="sev-kpi">
                  <div className={`sev-kpi-val${preview.data.breach_rate_pct >= 30 ? ' warn' : ''}`}>
                    {preview.data.breach_rate_pct}%
                  </div>
                  <div className="sev-kpi-lbl">SLA breach rate</div>
                </div>
                <div className="sev-kpi">
                  <div className="sev-kpi-val">
                    {preview.data.breach_count} of {preview.data.items.length}
                  </div>
                  <div className="sev-kpi-lbl">Currently breaching</div>
                </div>
              </div>

              {preview.data.unowned_count > 0 && (
                <div className="sev-note">
                  <strong>
                    Owner not assigned on {preview.data.unowned_count} of {preview.data.items.length} incidents.
                  </strong>{' '}
                  SLA escalation notifications have no recipient until an owner is assigned.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="sev-savebar">
        <span className="muted small">
          Severity scale: <strong>{levels.length} level{levels.length !== 1 ? 's' : ''}</strong>
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && (
            <span style={{ fontSize: 12, color: msg.includes('saved') ? 'var(--primary)' : '#ef4444' }}>
              {msg}
            </span>
          )}
          <button type="button" className="btn btn-secondary" onClick={handleReset}>
            Reset to saved
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saveConfig.isPending}
          >
            {saveConfig.isPending ? 'Saving…' : 'Save configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}