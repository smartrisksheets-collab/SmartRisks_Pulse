// src/components/risks/ExternalLinkModal.tsx

import { useState } from 'react';

interface Props {
  open:    boolean;
  onClose: () => void;
  tenantId: string;
}

export default function ExternalLinkModal({ open, onClose, tenantId }: Props) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const url = `${window.location.origin}/external/risk?workspace_id=${tenantId}`;

  function handleCopy() {
    navigator.clipboard.writeText(url)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => { const el = document.createElement('textarea'); el.value = url; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div className="modal-backdrop show" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-hd">
          <h3 className="modal-title">External Risk Submission Link</h3>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-bd">
          <span className="field-hint" style={{ marginBottom: 12 }}>
            Share this link with stakeholders to submit risks for review and approval.
          </span>
          <div className="field">
            <input
              type="text"
              readOnly
              value={url}
              onClick={e => (e.target as HTMLInputElement).select()}
            />
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>
    </div>
  );
}