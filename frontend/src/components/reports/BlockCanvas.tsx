// src/components/reports/BlockCanvas.tsx
// Report outline (UI step 7): optional cover, numbered sections with live figures,
// move up and down, remove, and the AI review state per section.

import { ChevronDown, ChevronUp, X } from 'lucide-react';
import type { BlockData, BlockDataMap, BlockKey, ReportSettings, SuppressedBlockData } from '../../types/report';
import { AI_BLOCKS, BLOCK_LABELS } from '../../types/report';
import ReportPreview from './ReportPreview';

function isSuppressed(d: BlockData | undefined): d is SuppressedBlockData {
  return !!d && (d as SuppressedBlockData).status === 'suppressed';
}

interface AIRowProps {
  blockKey:   BlockKey;
  hasText:    boolean;
  reviewed:   boolean;
  canAI:      boolean;
  busy:       boolean;
  onReviewed: (key: string, reviewed: boolean) => void;
  onGenerate: (keys: BlockKey[]) => void;
}

function AIRow({ blockKey, hasText, reviewed, canAI, busy, onReviewed, onGenerate }: AIRowProps) {
  if (busy) return <p className="pl-caption pl-rb-ai" role="status">Writing AI text…</p>;
  if (!hasText) {
    if (!canAI) return null;
    return (
      <div className="pl-rb-ai">
        <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" onClick={() => onGenerate([blockKey])}>Write AI text</button>
      </div>
    );
  }
  return (
    <div className="pl-rb-ai">
      <span className={`pl-chip ${reviewed ? 'pl-ok' : 'pl-sev-m'}`}>{reviewed ? 'Reviewed' : 'AI draft, not reviewed'}</span>
      <span className="pl-caption pl-grow">Written by AI from your figures</span>
      <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" onClick={() => onReviewed(blockKey, !reviewed)}>
        {reviewed ? 'Mark as not reviewed' : 'Mark as reviewed'}
      </button>
      {canAI && (
        <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => onGenerate([blockKey])}>Regenerate</button>
      )}
    </div>
  );
}

interface CoverProps {
  settings:   ReportSettings;
  periodText: string;
}

function CoverCard({ settings, periodText }: CoverProps) {
  const meta = [periodText, settings.prepared_for && `Prepared for ${settings.prepared_for}`, settings.footer_text]
    .filter(Boolean).join(' · ');
  return (
    <div className="pl-rb-cover" aria-label="Cover page">
      <p className="pl-rb-cover-k">Cover page</p>
      <p className="pl-rb-cover-t">{settings.report_title || 'SmartRisk Report'}</p>
      {meta && <p className="pl-rb-cover-m">{meta}</p>}
    </div>
  );
}

interface Props {
  activeBlocks: BlockKey[];
  blockData:    BlockDataMap;
  aiData:       Record<string, string>;
  aiReviewed:   string[];
  loadingKeys:  BlockKey[];
  generating:   BlockKey[];
  canAI:        boolean;
  settings:     ReportSettings;
  periodText:   string;
  onMove:       (key: BlockKey, dir: -1 | 1) => void;
  onRemove:     (key: BlockKey) => void;
  onEditNarrative: (key: string, value: string) => void;
  onReviewed:   (key: string, reviewed: boolean) => void;
  onGenerate:   (keys: BlockKey[]) => void;
}

export default function BlockCanvas({
  activeBlocks, blockData, aiData, aiReviewed, loadingKeys, generating, canAI, settings, periodText,
  onMove, onRemove, onEditNarrative, onReviewed, onGenerate,
}: Props) {
  const signoff = settings.signoff;
  return (
    <section className="pl-rb-outline" aria-label="Report outline">
      {settings.cover_page !== 'No' && <CoverCard settings={settings} periodText={periodText} />}

      {activeBlocks.length === 0 && (
        <div className="pl-rb-empty">No sections yet. Add them from the list, or pick a template.</div>
      )}

      {activeBlocks.map((key, i) => {
        const name = BLOCK_LABELS[key] ?? key;
        const data = blockData[key];
        const loading = loadingKeys.includes(key) && !data;
        return (
          <article key={key} className="pl-rb-blk" aria-label={name}>
            <div className="pl-rb-blk-h">
              <span className="pl-num-badge">{i + 1}</span>
              <h3 className="pl-item-title pl-grow">{name}</h3>
              <button type="button" className="pl-rb-ic" disabled={i === 0} aria-label={`Move ${name} up`} onClick={() => onMove(key, -1)}>
                <ChevronUp size={16} aria-hidden="true" />
              </button>
              <button type="button" className="pl-rb-ic" disabled={i === activeBlocks.length - 1} aria-label={`Move ${name} down`} onClick={() => onMove(key, 1)}>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              <button type="button" className="pl-rb-ic" aria-label={`Remove ${name}`} onClick={() => onRemove(key)}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="pl-rb-blk-b">
              {loading && <p className="pl-caption" role="status">Loading figures…</p>}
              {!loading && isSuppressed(data) && (
                <p className="pl-note">{data.reason} {data.requirement}</p>
              )}
              {!loading && data && !isSuppressed(data) && (
                <ReportPreview blockKey={key} blockData={blockData} aiData={aiData} onEdit={onEditNarrative} />
              )}
              {!loading && !data && <p className="pl-caption">Figures appear once the reporting period is valid.</p>}
              {AI_BLOCKS.has(key) && data && !isSuppressed(data) && (
                <AIRow blockKey={key} hasText={!!aiData[key]} reviewed={aiReviewed.includes(key)} canAI={canAI}
                  busy={generating.includes(key)} onReviewed={onReviewed} onGenerate={onGenerate} />
              )}
            </div>
          </article>
        );
      })}

      {signoff.include && (signoff.prepared_by || signoff.approved_by) && (
        <div className="pl-rb-blk pl-rb-blk-b">
          <dl className="pl-dl">
            {signoff.prepared_by && (
              <div><dt>Prepared by</dt><dd>{[signoff.prepared_by, signoff.prepared_title].filter(Boolean).join(', ')}</dd></div>
            )}
            {signoff.approved_by && (
              <div><dt>Approved by</dt><dd>{[signoff.approved_by, signoff.approved_title].filter(Boolean).join(', ')}</dd></div>
            )}
          </dl>
        </div>
      )}
    </section>
  );
}
