// src/components/settings/UnsavedBanner.tsx

interface Props {
  onSave: () => void;
  saving: boolean;
}

export default function UnsavedBanner({ onSave, saving }: Props) {
  return (
    <div className="unsaved-banner">
      <span className="unsaved-banner-text">You have unsaved changes</span>
      <button className="btn btn-primary btn-compact" type="button" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save now"}
      </button>
    </div>
  );
}