// src/components/risks/EvidencePreviewModal.tsx
// Shows a risk's evidence document in place: PDFs in a frame, images as an image.
// A saved document is opened through a signed link from the backend that expires
// after about a minute; a file not yet uploaded is shown from the browser's memory.

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, X } from 'lucide-react';
import { getEvidenceLink } from '../../services/risks';
import { isPdf } from '../../utils/evidence';

interface ModalProps {
  name:      string;
  mime:      string;
  url:       string | null;
  loading:   boolean;
  error:     string | null;
  onNewTab?: () => void;
  onClose:   () => void;
}

export function EvidencePreviewModal({ name, mime, url, loading, error, onNewTab, onClose }: ModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    // Capture on window so Escape closes only this dialog, not the risk panel under it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  let body: React.ReactNode;
  if (loading) {
    body = <p className="pl-caption" role="status">Opening the evidence…</p>;
  } else if (error || !url) {
    body = <p className="pl-note pl-alert" role="alert">{error ?? 'The evidence could not be opened.'}</p>;
  } else if (isPdf(mime)) {
    body = <iframe className="pl-evd-frame" src={url} title={`Evidence: ${name}`} />;
  } else {
    body = <img className="pl-evd-img" src={url} alt={`Evidence: ${name}`} />;
  }

  return (
    <div className="modal-backdrop show pl-app pl-evd-layer" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal pl-evd-modal" role="dialog" aria-modal="true" aria-labelledby="ev-preview-title">
        <div className="modal-hd">
          <h2 id="ev-preview-title" className="modal-title pl-evd-title">{name}</h2>
          <div className="pl-inline">
            {onNewTab && url && !error && (
              <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" onClick={onNewTab}>
                <ExternalLink size={14} aria-hidden="true" /> Open in new tab
              </button>
            )}
            <button ref={closeRef} type="button" className="pl-icon-btn" aria-label="Close preview" onClick={onClose}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="pl-evd-body">{body}</div>
      </div>
    </div>
  );
}

interface SavedProps {
  riskId:  string;
  version: string;   // risk.updated_at, so a replaced file is never shown from cache
  name:    string;
  mime:    string;
  onClose: () => void;
}

/** Preview of the document saved on a risk. Any member who can see the risk can open it. */
export function SavedEvidencePreview({ riskId, version, name, mime, onClose }: SavedProps) {
  const link = useQuery({
    queryKey: ['risks', 'evidence-link', riskId, version],
    queryFn:  () => getEvidenceLink(riskId),
    staleTime: Infinity,   // the frame loads once; a new tab asks for a fresh link
    gcTime: 0,             // reopening the preview always asks for a fresh link
    retry: false,
  });

  async function openNewTab() {
    // Open the tab inside the click so it is not blocked, then point it at a fresh link.
    const tab = window.open('about:blank', '_blank');
    try {
      const fresh = await getEvidenceLink(riskId);
      if (tab) {
        tab.opener = null;
        tab.location.href = fresh.url;
      }
    } catch {
      tab?.close();
    }
  }

  return (
    <EvidencePreviewModal
      name={link.data?.name || name}
      mime={link.data?.mime || mime}
      url={link.data?.url ?? null}
      loading={link.isLoading}
      error={link.isError ? (link.error instanceof Error ? link.error.message : 'The evidence could not be opened.') : null}
      onNewTab={openNewTab}
      onClose={onClose}
    />
  );
}
