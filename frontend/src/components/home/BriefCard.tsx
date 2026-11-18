// src/components/home/BriefCard.tsx
// "From your executive brief": the stored AI brief, first paragraph first.
// Generating it works as it did on the old dashboard.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { generateUnifiedBrief } from '../../services/dashboard';
import type { UnifiedBrief } from '../../types/dashboard';
import { timeAgo } from '../../utils/feedEvents';

export default function BriefCard({ stored, confidence, canGenerate, tourOn }: {
  stored: UnifiedBrief | null;
  confidence: string;
  canGenerate: boolean;
  tourOn: boolean;
}) {
  const qc = useQueryClient();
  const [fresh, setFresh] = useState<UnifiedBrief | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const brief = fresh ?? stored;
  const paras = brief ? (open ? brief.paragraphs : brief.paragraphs.slice(0, 1)) : [];

  async function generate() {
    setLoading(true);
    setErr(null);
    try {
      setFresh(await generateUnifiedBrief());
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The executive brief could not be generated.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="sec-brief" className={`pl-brief pl-tour-target${tourOn ? ' pl-tour-on' : ''}`} aria-label="Executive brief">
      <div className="pl-an-head">
        <h2 className="pl-label pl-brief-label">From your executive brief</h2>
        {confidence && <span className="pl-chip pl-brief-chip">{confidence} confidence</span>}
      </div>

      {brief ? (
        paras.map((p, i) => <p key={i} className="pl-brief-p" dangerouslySetInnerHTML={{ __html: p }} />)
      ) : (
        <p className="pl-brief-p">
          A plain-language brief of your figures, written for the board. It is generated on request.
        </p>
      )}
      {brief?.stale && (
        <p className="pl-brief-meta">The figures have changed since this brief was generated. Regenerate it before relying on it.</p>
      )}
      {err && <p className="pl-brief-err" role="alert">{err}</p>}

      <div className="pl-an-head pl-brief-foot">
        <span className="pl-brief-meta">
          {brief && <>Generated {timeAgo(brief.generated_at)}{brief.generated_by ? ` by ${brief.generated_by}` : ''}. </>}
          Validate alongside professional judgment.{' '}
          <a href="https://smartrisksheets.com/ai-transparency-data-use-statement/" target="_blank" rel="noreferrer">
            Learn more
          </a>
        </span>
        <span className="pl-inline">
          {canGenerate && (
            <button type="button" className={`pl-btn ${brief ? 'pl-btn-on-dark' : 'pl-btn-primary'}`} onClick={generate} disabled={loading}>
              {loading ? 'Generating...' : brief ? 'Regenerate' : 'Generate executive brief'}
            </button>
          )}
          {brief && brief.paragraphs.length > 1 && (
            <button type="button" className="pl-btn pl-btn-primary" onClick={() => setOpen(o => !o)} aria-expanded={open}>
              {open ? 'Show less' : 'Read the full brief'}
            </button>
          )}
        </span>
      </div>
    </section>
  );
}
