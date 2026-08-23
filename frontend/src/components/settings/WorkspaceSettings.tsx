// src/components/settings/WorkspaceSettings.tsx

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { applyBrandColors } from "../../utils/brand";
import { useSettings } from "../../hooks/useSettings";
import UnsavedBanner from "./UnsavedBanner";
import { uploadLogo } from "../../services/settings";
import type { SettingsData, SettingsUpdate } from "../../types/settings";

const INDUSTRIES = [
  "Finance","Healthcare","Technology","Government",
  "Manufacturing","Retail","Education","Energy","Oil & gas","Other",
];
const FRAMEWORKS = ["ISO 31000","NIST CSF","COSO ERM","COBIT","ISO 27001","Custom"];
const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "Africa/Lagos", label: "Africa/Lagos (WAT)" },
  { value: "America/New_York", label: "America/New_York (EST)" },
  { value: "America/Chicago", label: "America/Chicago (CST)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
];
const DATE_FORMATS = ["YYYY-MM-DD","MM/DD/YYYY","DD/MM/YYYY","DD-MMM-YYYY"];
const CURRENCIES = [
  { value: "₦", label: "₦ — Nigerian Naira (NGN)" },
  { value: "$", label: "$ — US Dollar (USD)" },
  { value: "£", label: "£ — British Pound (GBP)" },
  { value: "€", label: "€ — Euro (EUR)" },
  { value: "¥", label: "¥ — Japanese Yen (JPY)" },
  { value: "₹", label: "₹ — Indian Rupee (INR)" },
  { value: "R", label: "R — South African Rand (ZAR)" },
];

interface Props {
  settings: SettingsData;
}

export default function WorkspaceSettings({ settings }: Props) {
  const { update, setPinMutation, removePinMutation } = useSettings();

  // ── identity form state ──────────────────────────────────────────────
  const [form, setForm] = useState<SettingsUpdate>({
    name: settings.name,
    organization: settings.organization,
    industry: settings.industry,
    framework: settings.framework,
    timezone: settings.timezone,
    date_format: settings.date_format,
    currency_symbol: settings.currency_symbol,
    primary_color: settings.primary_color,
    accent_color: settings.accent_color,
    theme_mode: settings.theme_mode,
    logo_url: settings.logo_url ?? undefined,
  });

  const [msg, setMsg] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(settings.logo_url);

  // ── PIN state ────────────────────────────────────────────────────────
  const [pinNew, setPinNew] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [pinVisible, setPinVisible] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  function field(key: keyof SettingsUpdate, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setMsg("");
    try {
      const { logo_url } = await uploadLogo(file);
      setLogoPreview(logo_url);
      setForm((f) => ({ ...f, logo_url }));
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setMsg(`Logo upload failed: ${detail}`);
      console.error("Logo upload error:", err);
    } finally {
      setLogoUploading(false);
    }
  }

  function handleLogoRemove() {
    setLogoPreview(null);
    setForm((f) => ({ ...f, logo_url: undefined }));
  }

  async function handleSave() {
    setMsg("");
    update.mutate(form, {
      onSuccess: () => setMsg("Settings saved."),
      onError: () => setMsg("Save failed. Please try again."),
    });
  }

  async function handleSavePin() {
    setPinMsg("");
    if (!/^\d{6}$/.test(pinNew)) { setPinMsg("PIN must be exactly 6 digits."); return; }
    if (pinNew !== pinConfirm) { setPinMsg("PINs do not match."); return; }
    setPinMutation.mutate(pinNew, {
      onSuccess: () => { setPinMsg("PIN saved."); setPinNew(""); setPinConfirm(""); },
      onError: () => setPinMsg("Failed to save PIN."),
    });
  }

  async function handleRemovePin() {
    setPinMsg("");
    removePinMutation.mutate(undefined, {
      onSuccess: () => setPinMsg("PIN removed."),
      onError: () => setPinMsg("Only the workspace Owner can remove the PIN."),
    });
  }

  const saving = update.isPending;

  const isDirty =
    form.name !== settings.name ||
    form.organization !== settings.organization ||
    form.industry !== settings.industry ||
    form.framework !== settings.framework ||
    form.timezone !== settings.timezone ||
    form.date_format !== settings.date_format ||
    form.currency_symbol !== settings.currency_symbol ||
    form.primary_color !== settings.primary_color ||
    form.accent_color !== settings.accent_color ||
    form.theme_mode !== settings.theme_mode ||
    (form.logo_url ?? null) !== settings.logo_url;

  return (
    <>
      {isDirty && <UnsavedBanner onSave={handleSave} saving={saving} />}

      {/* Brand & Appearance */}
      <div className="settings-section">
        <div className="settings-title">Brand & Appearance</div>
        <p className="muted small">Upload your workspace logo and customize the theme.</p>

        <div className="brand-grid" style={{ marginTop: 12 }}>
          {/* Logo */}
          <div className="field">
            <label>Workspace Logo</label>
            <div className="logo-box">
              <div className="logo-preview">
                {logoPreview ? (
                  <img src={logoPreview} alt="Workspace logo" />
                ) : (
                  <span className="muted small">No logo uploaded yet.</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={handleLogoChange}
                  disabled={logoUploading}
                />
                <button className="btn btn-secondary" type="button" onClick={handleLogoRemove}>
                  Remove
                </button>
              </div>
              <span className="tiny" style={{ marginTop: 8, display: "block" }}>
                Recommended: PNG or SVG. Square works best (e.g. 512×512).
              </span>
            </div>
          </div>

          {/* Theme */}
          <div className="field">
            <label>Theme</label>
            <div className="row2" style={{ marginTop: 0 }}>
              <div className="field">
                <label className="tiny">Primary Color</label>
                <div className="color-row">
                  <input
                    type="color"
                    value={form.primary_color ?? "#01b88e"}
                    onChange={(e) => field("primary_color", e.target.value)}
                  />
                  <input
                    type="text"
                    value={form.primary_color ?? "#01b88e"}
                    onChange={(e) => field("primary_color", e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label className="tiny">Accent Color</label>
                <div className="color-row">
                  <input
                    type="color"
                    value={form.accent_color ?? "#1F2854"}
                    onChange={(e) => field("accent_color", e.target.value)}
                  />
                  <input
                    type="text"
                    value={form.accent_color ?? "#1F2854"}
                    onChange={(e) => field("accent_color", e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label className="tiny">Mode</label>
                <select value={form.theme_mode ?? "light"} onChange={(e) => field("theme_mode", e.target.value)}>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="auto">Auto (System)</option>
                </select>
              </div>
              <div className="field">
                <label className="tiny">Preview</label>
                <div
                  className="swatch"
                  style={{ background: form.primary_color ?? "#01b88e", color: "#fff" }}
                >
                  <span>Buttons / Badges</span>
                  <span className="tiny">{form.primary_color ?? "#01b88e"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workspace Identity */}
      <div className="settings-section" style={{ marginTop: 24 }}>
        <div className="settings-title">Workspace Identity</div>

        <div className="row2">
          <div className="field">
            <label>Workspace Name</label>
            <input
              type="text"
              value={form.name ?? ""}
              placeholder="SmartRisk GRC Workspace"
              onChange={(e) => field("name", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Organization</label>
            <input
              type="text"
              value={form.organization ?? ""}
              placeholder="Company Name"
              onChange={(e) => field("organization", e.target.value)}
            />
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <label>Industry</label>
            <select value={form.industry ?? ""} onChange={(e) => field("industry", e.target.value)}>
              <option value="">Select…</option>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Framework</label>
            <select value={form.framework ?? "ISO 31000"} onChange={(e) => field("framework", e.target.value)}>
              {FRAMEWORKS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <label>Timezone</label>
            <select value={form.timezone ?? "UTC"} onChange={(e) => field("timezone", e.target.value)}>
              {TIMEZONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Date Format</label>
            <select value={form.date_format ?? "YYYY-MM-DD"} onChange={(e) => field("date_format", e.target.value)}>
              {DATE_FORMATS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <label>Currency</label>
            <select value={form.currency_symbol ?? "₦"} onChange={(e) => field("currency_symbol", e.target.value)}>
              {CURRENCIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="tiny" style={{ marginBottom: 6 }}>Preview</label>
            <div className="swatch" style={{ fontSize: 15, fontWeight: 700, color: "#1F2854" }}>
              {form.currency_symbol ?? "₦"} 1,000,000
            </div>
          </div>
        </div>

        {msg && (
          <p style={{ fontSize: 13, color: msg.includes("failed") ? "#ef4444" : "#01b88e", marginTop: 8 }}>
            {msg}
          </p>
        )}

        <div className="settings-actions">
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!isDirty}
            onClick={() => setShowResetConfirm(true)}
          >
            Reset
          </button>
          <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* PIN Security */}
      <div className="settings-section" style={{ marginTop: 24 }}>
        <div className="settings-title">Workspace PIN</div>
        <p className="muted small">
          Set a 6-digit PIN all users must enter before accessing this workspace.
          {settings.has_pin ? " A PIN is currently set." : " No PIN is currently set."}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 340 }}>
          <div className="field">
            <label>New PIN <span style={{ color: "#64748b", fontWeight: 400 }}>(6 digits)</span></label>
            <div className="input-wrap">
              <input
                type={pinVisible ? "text" : "password"}
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={pinNew}
                onChange={(e) => setPinNew(e.target.value)}
                style={{ letterSpacing: ".3em", fontSize: 20 }}
              />
              <button
                type="button"
                className="input-eye"
                onClick={() => setPinVisible((v) => !v)}
                aria-label={pinVisible ? "Hide PIN" : "Show PIN"}
              >
                {pinVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="field">
            <label>Confirm PIN</label>
            <div className="input-wrap">
              <input
                type={pinVisible ? "text" : "password"}
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value)}
                style={{ letterSpacing: ".3em", fontSize: 20 }}
              />
              <button
                type="button"
                className="input-eye"
                onClick={() => setPinVisible((v) => !v)}
                aria-label={pinVisible ? "Hide PIN" : "Show PIN"}
              >
                {pinVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {pinMsg && (
            <p style={{ fontSize: 13, color: pinMsg.includes("saved") || pinMsg.includes("removed") ? "#01b88e" : "#ef4444" }}>
              {pinMsg}
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-compact" type="button" onClick={handleSavePin} disabled={setPinMutation.isPending}>
              Save PIN
            </button>
            <button className="btn btn-secondary btn-compact" type="button" onClick={handleRemovePin} disabled={removePinMutation.isPending || !settings.has_pin}>
              Remove PIN
            </button>
          </div>
        </div>
      </div>
    {showResetConfirm && (
        <div className="srs-confirm-backdrop" onClick={() => setShowResetConfirm(false)}>
          <div className="srs-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="srs-confirm-hd">Reset all changes?</div>
            <div className="srs-confirm-bd">
              This will revert your logo, colors, and workspace details back to the last saved state. Any unsaved changes will be lost.
            </div>
            <div className="srs-confirm-ft">
              <button className="btn btn-secondary btn-compact" type="button" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-compact" type="button" onClick={() => {
                setForm({
                  name: settings.name, organization: settings.organization,
                  industry: settings.industry, framework: settings.framework,
                  timezone: settings.timezone, date_format: settings.date_format,
                  currency_symbol: settings.currency_symbol,
                  primary_color: settings.primary_color, accent_color: settings.accent_color,
                  theme_mode: settings.theme_mode, logo_url: settings.logo_url ?? undefined,
                });
                setLogoPreview(settings.logo_url ?? null);
                applyBrandColors(settings.primary_color, settings.accent_color);
                setShowResetConfirm(false);
              }}>
                Yes, Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}