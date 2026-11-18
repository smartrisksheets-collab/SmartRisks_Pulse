// src/components/risks/EvidenceField.tsx
// Evidence document on the risk form. Choosing, replacing or removing a file is
// held in the form and applied when the risk is saved, so Cancel discards it.
// A control counts as evidenced only with a recent independent test and a
// document on file; the backend decides that, this field only collects the file.

import { useEffect, useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import type { EvidenceChange } from '../../types/risk';
import { formatDate } from '../../utils/format';
import { EVIDENCE_ACCEPT, EVIDENCE_TYPES_TEXT, checkEvidenceFile, evidenceMime, formatBytes } from '../../utils/evidence';
import { EvidencePreviewModal, SavedEvidencePreview } from './EvidencePreviewModal';

export interface SavedEvidence {
  riskId:      string;
  version:     string;
  name:        string;
  mime:        string;
  size:        number | null;
  uploadedAt:  string | null;
  uploadedBy:  string | null;
}

interface Props {
  saved:    SavedEvidence | null;
  value:    EvidenceChange;
  disabled: boolean;
  onChange: (next: EvidenceChange) => void;
}

interface LocalPreview { url: string; name: string; mime: string }

export default function EvidenceField({ saved, value, disabled, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const localUrl = useRef<string | null>(null);
  const [error, setError] = useState('');
  const [local, setLocal] = useState<LocalPreview | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  // Free the in-memory copy of a picked file if the form goes away mid-preview.
  useEffect(() => () => { if (localUrl.current) URL.revokeObjectURL(localUrl.current); }, []);

  function pick() {
    inputRef.current?.click();
  }

  function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';   // so choosing the same file again still fires
    if (!file) return;
    const msg = checkEvidenceFile(file);
    setError(msg);
    if (msg) return;
    onChange({ file, remove: false });
  }

  function previewPicked(file: File) {
    const url = URL.createObjectURL(file);
    localUrl.current = url;
    setLocal({ url, name: file.name, mime: evidenceMime(file) });
  }

  function closeLocal() {
    if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    localUrl.current = null;
    setLocal(null);
  }

  const input = (
    <input ref={inputRef} type="file" className="sr-only" accept={EVIDENCE_ACCEPT} tabIndex={-1}
      aria-hidden="true" onChange={onPicked} />
  );

  let body: React.ReactNode;
  if (value.file) {
    const file = value.file;
    body = (
      <div className="pl-evd-file">
        <FileText size={18} aria-hidden="true" className="pl-evd-icon" />
        <div className="pl-grow">
          <span className="pl-evd-name">{file.name}</span>
          <span className="pl-meta">{formatBytes(file.size)} · uploads when you save{saved ? ' and replaces the current file' : ''}</span>
        </div>
        <div className="pl-inline">
          <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" onClick={() => previewPicked(file)} disabled={disabled}>Preview</button>
          <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" onClick={pick} disabled={disabled}>Choose another</button>
          <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => onChange({ file: null, remove: false })} disabled={disabled}>
            {saved ? 'Keep current' : 'Clear'}
          </button>
        </div>
      </div>
    );
  } else if (saved && value.remove) {
    body = (
      <div className="pl-evd-file pl-evd-removing">
        <FileText size={18} aria-hidden="true" className="pl-evd-icon" />
        <div className="pl-grow">
          <span className="pl-evd-name">{saved.name}</span>
          <span className="pl-meta">Removed when you save. The control then shows as unevidenced.</span>
        </div>
        <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => onChange({ file: null, remove: false })} disabled={disabled}>Undo</button>
      </div>
    );
  } else if (saved) {
    const when = saved.uploadedAt ? ` · added ${formatDate(saved.uploadedAt)}` : '';
    const who  = saved.uploadedBy ? ` by ${saved.uploadedBy}` : '';
    body = (
      <div className="pl-evd-file">
        <FileText size={18} aria-hidden="true" className="pl-evd-icon" />
        <div className="pl-grow">
          <span className="pl-evd-name">{saved.name}</span>
          <span className="pl-meta">{formatBytes(saved.size)}{when}{who}</span>
        </div>
        <div className="pl-inline">
          <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" onClick={() => setShowSaved(true)} disabled={disabled}>Preview</button>
          <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" onClick={pick} disabled={disabled}>Replace</button>
          <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => onChange({ file: null, remove: true })} disabled={disabled}>Remove</button>
        </div>
      </div>
    );
  } else {
    body = (
      <button type="button" className="pl-evd-drop" onClick={pick} disabled={disabled} aria-describedby="rf-ev-help">
        <Upload size={18} aria-hidden="true" />
        <span>Upload evidence of the control test</span>
      </button>
    );
  }

  return (
    <div className="pl-field">
      <span className="pl-field-label" id="rf-ev-label">Evidence document</span>
      {input}
      {body}
      {error
        ? <p className="pl-field-error" role="alert">{error}</p>
        : <span className="pl-help" id="rf-ev-help">{EVIDENCE_TYPES_TEXT}. Without a document the control shows as unevidenced on the dashboard.</span>}
      {local && (
        <EvidencePreviewModal name={local.name} mime={local.mime} url={local.url} loading={false} error={null} onClose={closeLocal} />
      )}
      {showSaved && saved && (
        <SavedEvidencePreview riskId={saved.riskId} version={saved.version} name={saved.name} mime={saved.mime}
          onClose={() => setShowSaved(false)} />
      )}
    </div>
  );
}
