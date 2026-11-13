// src/components/home/Tour.tsx
// The 60-second tour: one card that walks through the Home sections in order.

import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { TourStep } from './links';

export default function Tour({ steps, index, onGo, onClose }: {
  steps: TourStep[];
  index: number;
  onGo: (i: number) => void;
  onClose: () => void;
}) {
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(step.id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }, [step.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="pl-tour" role="dialog" aria-label="60-second tour" aria-live="polite">
      <div className="pl-an-head">
        <span className="pl-tour-step">STEP {index + 1} OF {steps.length}</span>
        <button type="button" className="pl-tour-x" onClick={onClose} aria-label="Close tour"><X size={18} /></button>
      </div>
      <p className="pl-tour-title">{step.title}</p>
      <p className="pl-tour-text">{step.text}</p>
      <div className="pl-an-head pl-tour-foot">
        <span className="pl-tour-dots" aria-hidden="true">
          {steps.map((s, i) => <span key={s.id} className={i <= index ? 'pl-on' : undefined} />)}
        </span>
        <span className="pl-inline">
          {index > 0 && <button type="button" className="pl-btn pl-btn-on-dark" onClick={() => onGo(index - 1)}>Back</button>}
          <button type="button" className="pl-btn pl-btn-primary" onClick={() => (last ? onClose() : onGo(index + 1))}>
            {last ? 'Finish' : 'Next'}
          </button>
        </span>
      </div>
    </div>
  );
}
