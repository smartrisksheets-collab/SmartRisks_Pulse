// src/components/settings/LookupEditor.tsx

import { useState } from "react";
import { useLookups } from "../../hooks/useLookups";
import type { LookupPatchResult } from "../../hooks/useLookups";
import { checkUsage } from "../../services/lookups";
import type { LookupPatch, LookupListKey } from "../../services/lookups";
import UnsavedBanner from "./UnsavedBanner";
import { useAuthStore } from "../../store/authStore";

// Module-level constants — not inside component body
const HARD_BLOCK = new Set(['risk_owner']);
const SOFT_WARN  = new Set(['category', 'treatment', 'incident_category', 'incident_severity']);

const LOOKUP_KEYS: LookupListKey[] = [
  "category",
  "treatment",
  "risk_owner",
  "business_unit",
  "incident_category",
  "incident_severity",
];

const LOOKUP_LABELS: Record<string, string> = {
  category:          "Category",
  treatment:         "Treatment",
  risk_owner:        "Dept/Risk Owner",
  business_unit:     "Business Unit",
  incident_category: "Incident Category",
  incident_severity: "Incident Severity",
};

type LocalLookups = Record<string, string[]>;
type CategoryMap = Record<string, string[]>;

function copyMap(map: CategoryMap): CategoryMap {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v]]));
}

function mapsEqual(a: CategoryMap, b: CategoryMap): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => {
    const va = [...a[k]].sort();
    const vb = [...(b[k] ?? [])].sort();
    return va.length === vb.length && va.every((v, i) => v === vb[i]);
  });
}

function pruneMap(map: CategoryMap, incidentCats: string[], riskCats: string[]): CategoryMap {
  const out: CategoryMap = {};
  Object.entries(map).forEach(([k, v]) => {
    if (incidentCats.includes(k)) out[k] = v.filter((c) => riskCats.includes(c));
  });
  return out;
}

function CategoryMapCard({ incidentCategories, riskCategories, map, onChange }: {
  incidentCategories: string[];
  riskCategories: string[];
  map: CategoryMap;
  onChange: (next: CategoryMap) => void;
}) {
  const explicitCount = incidentCategories.filter((c) => Object.prototype.hasOwnProperty.call(map, c)).length;

  function toggle(inc: string, rc: string, selected: string[]) {
    const next = selected.includes(rc) ? selected.filter((c) => c !== rc) : [...selected, rc];
    onChange({ ...map, [inc]: next });
  }

  function reset(inc: string) {
    const next = { ...map };
    delete next[inc];
    onChange(next);
  }

  return (
    <div className="tax-card">
      <div className="tax-card-hd">
        <span className="tax-card-hd-title">Incident to Risk Category Mapping</span>
        <span className="tiny muted">{explicitCount} set manually</span>
      </div>
      <div className="tax-card-bd">
        <p className="muted small cat-map-intro">
          Choose which risk categories cover each incident category. The dashboard uses this to tell a real
          register gap apart from a naming difference. Rows left on automatic match a risk category with the same name.
        </p>
        {incidentCategories.map((inc) => {
          const explicit = Object.prototype.hasOwnProperty.call(map, inc);
          const auto = riskCategories.filter((c) => c.trim().toLowerCase() === inc.trim().toLowerCase()).slice(0, 1);
          const selected = explicit ? map[inc] : auto;
          return (
            <div key={inc} className="cat-map-row">
              <div className="cat-map-name">{inc}</div>
              <div className="cat-map-chips">
                {riskCategories.map((rc) => {
                  const on = selected.includes(rc);
                  return (
                    <button
                      key={rc}
                      type="button"
                      className={`cat-map-chip${on ? " on" : ""}`}
                      aria-pressed={on}
                      onClick={() => toggle(inc, rc, selected)}
                    >
                      {rc}
                    </button>
                  );
                })}
              </div>
              <div className="cat-map-state">
                {explicit
                  ? selected.length === 0 && <span className="cat-map-gap">Not covered by any risk category</span>
                  : <span className="tiny muted">{auto.length ? "Automatic, same-name match" : "Automatic, no same-name match"}</span>}
                {explicit && (
                  <button type="button" className="cat-map-reset" onClick={() => reset(inc)}>
                    Reset to automatic
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Inner component — receives lookups as prop, initializes state once via lazy initializer.
// No useEffect needed. Mounted only after outer gate confirms lookups is non-null.
function LookupEditorContent({ lookups, patch, visibleKeys }: {
  lookups: import("../../services/lookups").Lookups;
  patch: (updates: LookupPatch) => Promise<LookupPatchResult>;
  visibleKeys: Array<keyof LookupPatch>;
}) {
  const [local, setLocal] = useState<LocalLookups>(() => {
    const seed: LocalLookups = {};
    LOOKUP_KEYS.forEach((k) => { seed[k] = [...(lookups[k] ?? [])]; });
    return seed;
  });
  const [localMap, setLocalMap]     = useState<CategoryMap>(() => copyMap(lookups.incident_category_map ?? {}));
  const [addInputs, setAddInputs]   = useState<Record<string, string>>({});
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState("");

  const showMap = visibleKeys.includes("incident_category");

  const listsDirty = LOOKUP_KEYS.some((k) => {
    const a = local[k] ?? [];
    const b = lookups[k] ?? [];
    return a.length !== b.length || a.some((v, i) => v !== b[i]);
  });
  const isDirty = listsDirty || (showMap && !mapsEqual(localMap, lookups.incident_category_map ?? {}));
  const [checking, setChecking]     = useState<string | null>(null);
  const [blockModal, setBlockModal] = useState<{ value: string; count: number } | null>(null);
  const [warnModal, setWarnModal]   = useState<{ key: string; index: number; value: string; count: number } | null>(null);

  function removeChip(key: string, index: number) {
    setLocal((prev) => ({ ...prev, [key]: prev[key].filter((_, i) => i !== index) }));
  }

  async function handleChipDelete(key: string, index: number) {
    const val = local[key][index];
    if (!HARD_BLOCK.has(key) && !SOFT_WARN.has(key)) {
      removeChip(key, index);
      return;
    }
    setChecking(`${key}-${index}`);
    try {
      const result = await checkUsage(key, val);
      if (result.count === 0) {
        removeChip(key, index);
      } else if (HARD_BLOCK.has(key)) {
        setBlockModal({ value: val, count: result.count });
      } else {
        setWarnModal({ key, index, value: val, count: result.count });
      }
    } catch {
      removeChip(key, index);
    } finally {
      setChecking(null);
    }
  }

  function setAddInput(key: string, value: string) {
    setAddInputs((prev) => ({ ...prev, [key]: value }));
  }

  function addChip(key: string) {
    const val = (addInputs[key] ?? "").trim();
    if (!val) return;
    if (local[key]?.some(v => v.toLowerCase() === val.toLowerCase())) {
      setAddInputs((prev) => ({ ...prev, [key]: "" }));
      return;
    }
    setLocal((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), val] }));
    setAddInputs((prev) => ({ ...prev, [key]: "" }));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, key: string) {
    if (e.key === "Enter") {
      e.preventDefault();
      addChip(key);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMsg("");
    const payload: LookupPatch = {};
    LOOKUP_KEYS.forEach((k) => {
      payload[k] = local[k] ?? [];
    });
    if (showMap) {
      payload.incident_category_map = pruneMap(localMap, local.incident_category ?? [], local.category ?? []);
    }
    const { data: result, error: saveError } = await patch(payload);
    setSaving(false);
    if (result) {
      setLocal((prev) => {
        const next = { ...prev };
        LOOKUP_KEYS.forEach((k) => { next[k] = [...(result[k] ?? [])]; });
        return next;
      });
      setLocalMap(copyMap(result.incident_category_map ?? {}));
      setMsg("Configuration saved.");
    } else {
      setMsg(saveError ?? "Save failed. Please try again.");
    }
  }

  return (
    <div className="settings-section">
      {isDirty && <UnsavedBanner onSave={handleSave} saving={saving} />}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="settings-title">Risk Configuration</div>
          <p className="muted small">
            Manage dropdown values used across Risk Register, Incidents, and forms.
          </p>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
        {visibleKeys.map((key) => (
          <div key={key} className="tax-card">
            <div className="tax-card-hd">
              <span className="tax-card-hd-title">{LOOKUP_LABELS[key]}</span>
              <span className="tiny muted">{(local[key] ?? []).length} values</span>
            </div>
            <div className="tax-card-bd">
              <div className="tax-chips">
                {(local[key] ?? []).map((val, i) => (
                  <span key={`${key}-${i}`} className="tax-chip">
                    {val}
                    <button
                      className="tax-chip-del"
                      type="button"
                      onClick={() => handleChipDelete(key, i)}
                      disabled={checking === `${key}-${i}`}
                      aria-label={`Remove ${val}`}
                    >
                      {checking === `${key}-${i}` ? "…" : "×"}
                    </button>
                  </span>
                ))}
              </div>
              <div className="tax-add-row">
                <input
                  type="text"
                  placeholder={`Add to ${LOOKUP_LABELS[key]}…`}
                  value={addInputs[key] ?? ""}
                  onChange={(e) => setAddInput(key, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, key)}
                />
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => addChip(key)}
                  style={{ padding: "8px 14px" }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        ))}
        {showMap && (
          <CategoryMapCard
            incidentCategories={local.incident_category ?? []}
            riskCategories={local.category ?? []}
            map={localMap}
            onChange={setLocalMap}
          />
        )}
      </div>

      {msg && (
        <p style={{ fontSize: 13, color: msg.includes("saved") ? "#01b88e" : "#ef4444", marginTop: 10, whiteSpace: "pre-line" }}>
          {msg}
        </p>
      )}

      {/* Hard block modal — risk_owner tied to risks */}
      {blockModal && (
        <div className="srs-confirm-backdrop" onClick={() => setBlockModal(null)}>
          <div className="srs-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="srs-confirm-hd">Cannot delete "{blockModal.value}"</div>
            <div className="srs-confirm-bd">
              This owner is assigned to <strong>{blockModal.count} risk{blockModal.count !== 1 ? "s" : ""}</strong> in the register.
              Reassign or remove those risks first, then delete this owner.
            </div>
            <div className="srs-confirm-ft">
              <button className="btn btn-primary btn-compact" type="button" onClick={() => setBlockModal(null)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Soft warn modal — category, treatment, incident fields */}
      {warnModal && (
        <div className="srs-confirm-backdrop" onClick={() => setWarnModal(null)}>
          <div className="srs-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="srs-confirm-hd">This value is in use</div>
            <div className="srs-confirm-bd">
              "{warnModal.value}" is currently assigned to <strong>{warnModal.count} record{warnModal.count !== 1 ? "s" : ""}</strong>.
              Deleting it will set those records to unclassified. This cannot be undone without manual reassignment.
            </div>
            <div className="srs-confirm-ft">
              <button className="btn btn-secondary btn-compact" type="button" onClick={() => setWarnModal(null)}>
                Cancel
              </button>
              <button className="btn btn-danger btn-compact" type="button" onClick={() => {
                removeChip(warnModal.key, warnModal.index);
                setWarnModal(null);
              }}>
                Delete Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="settings-actions" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Configuration"}
        </button>
      </div>
    </div>
  );
}

// Outer gate — ensures LookupEditorContent only mounts when lookups is non-null.
export default function LookupEditor() {
  const { lookups, loading, error, patchWithError } = useLookups();
  const modules     = useAuthStore(s => s.claims?.modules ?? []);
  const hasIncident = modules.includes('incident');

  const INCIDENT_KEYS = new Set<LookupListKey>(['incident_category', 'incident_severity']);
  const visibleKeys   = LOOKUP_KEYS.filter(k => hasIncident || !INCIDENT_KEYS.has(k));

  if (loading) return <p className="muted small">Loading configuration…</p>;
  if (error) return <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>;
  if (!lookups) return null;
  return (
    <LookupEditorContent
      key={lookups.updated_at ?? 'init'}
      lookups={lookups}
      patch={patchWithError}
      visibleKeys={visibleKeys}
    />
  );
}