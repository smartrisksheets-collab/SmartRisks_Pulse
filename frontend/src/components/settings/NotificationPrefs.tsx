// src/components/settings/NotificationPrefs.tsx

import { useState } from "react";
import { useNotificationPrefs } from "../../hooks/useSettings";
import type { NotificationPref, NotificationPrefUpdate } from "../../types/settings";

// Inner component — prefs is guaranteed non-null, state initialized once at mount.
function NotificationPrefsContent({
  prefs,
  onSave,
  isPending,
}: {
  prefs: NotificationPref;
  onSave: (
    payload: NotificationPrefUpdate,
    opts: { onSuccess: () => void; onError: () => void }
  ) => void;
  isPending: boolean;
}) {
  const [frequency, setFrequency] = useState(prefs.brief_frequency);
  const [optedOut, setOptedOut] = useState(prefs.opted_out);
  const [msg, setMsg] = useState("");

  function handleSave() {
    setMsg("");
    onSave(
      { brief_frequency: frequency, opted_out: optedOut },
      {
        onSuccess: () => setMsg("Preferences saved."),
        onError:   () => setMsg("Save failed. Please try again."),
      }
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-title">My Brief Preferences</div>
      <p className="muted small">
        Controls how often you personally receive the Risk Brief email. These are per-user and override the workspace schedule for your account only.
      </p>

      <div className="row2" style={{ marginTop: 14 }}>
        <div className="field">
          <label>Brief Frequency</label>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly only</option>
            <option value="off">Off</option>
          </select>
          <p className="muted small" style={{ marginTop: 4 }}>
            Daily sends every morning the brief runs. Weekly sends on Mondays only.
          </p>
        </div>
        <div className="field">
          <label>Opt Out</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <input
              type="checkbox"
              id="notif-opt-out"
              checked={optedOut}
              onChange={(e) => setOptedOut(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            <label htmlFor="notif-opt-out" style={{ fontWeight: 400, margin: 0 }}>
              Do not send me any brief emails
            </label>
          </div>
        </div>
      </div>

      {msg && (
        <p style={{ fontSize: 13, color: msg.includes("saved") ? "#01b88e" : "#ef4444", marginTop: 10 }}>
          {msg}
        </p>
      )}

      <div className="settings-actions">
        <button
          className="btn btn-primary"
          type="button"
          onClick={handleSave}
          disabled={isPending}
        >
          {isPending ? "Saving…" : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}

// Outer gate — mounts inner component only when prefs data is available.
export default function NotificationPrefs() {
  const { query, update } = useNotificationPrefs();
  if (query.isLoading) return <p className="muted small">Loading preferences…</p>;
  if (!query.data) return null;
  return (
    <NotificationPrefsContent
      prefs={query.data}
      onSave={update.mutate}
      isPending={update.isPending}
    />
  );
}