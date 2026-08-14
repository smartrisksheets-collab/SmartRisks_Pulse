// src/components/incidents/IncidentExternalLinkModal.tsx

import { useState } from 'react';

interface Props {
  workspaceId: string;
  onClose:     () => void;
}

export default function IncidentExternalLinkModal({ workspaceId, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const link = workspaceId
    ? `${window.location.origin}/external/incident?workspace_id=${encodeURIComponent(workspaceId)}`
    : '';

  function handleCopy() {
    if (!link) return;
    navigator.clipboard.writeText(link)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Fallback for browsers that block clipboard API
        const el = document.getElementById('ext-inc-url-input') as HTMLInputElement | null;
        el?.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'block' }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.45)' }} />

      {/* Panel */}
      <div
        style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 'min(480px,92vw)',
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(15,23,42,.15)',
          padding: 24,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1F2854' }}>
            External Incident Submission Link
          </span>
          <button
            onClick={onClose}
            type="button"
            style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b' }}
          >
            ✕
          </button>
        </div>

        {/* Description */}
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
          Empower your stakeholders to report incidents instantly via a secure, external submission link.
        </div>

        {/* URL input */}
        <input
          id="ext-inc-url-input"
          type="text"
          readOnly
          value={link || 'Link unavailable — workspace ID missing.'}
          style={{
            width: '100%',
            fontSize: 12,
            color: '#1e293b',
            background: '#f8fafc',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: '8px 12px',
            boxSizing: 'border-box',
            cursor: 'default',
            outline: 'none',
          }}
        />

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button
            onClick={onClose}
            type="button"
            style={{
              padding: '7px 16px', borderRadius: 8,
              border: '1px solid #e5e7eb', background: '#fff',
              fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer',
            }}
          >
            Close
          </button>
          <button
            onClick={handleCopy}
            disabled={!link}
            type="button"
            style={{
              padding: '7px 16px', borderRadius: 8,
              border: 'none', background: '#1F2854',
              fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer',
            }}
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>
    </div>
  );
}