import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useHelpEntries } from '../../hooks/useHelp';
import { logHelpEvent } from '../../services/help';
import { HELP_POP_GUTTER, HELP_POP_WIDTH, canAct, lockedNote } from '../../utils/helpSearch';
import { withBold } from '../../utils/richText';

interface ExplainProps {
  id:       string;
  variant?: 'inline' | 'corner';
}

interface PopPos { top: number; left: number; }

export default function Explain({ id, variant = 'inline' }: ExplainProps) {
  const { data: entries } = useHelpEntries();
  const perms    = useAuthStore(s => s.claims?.permissions ?? null);
  const navigate = useNavigate();
  const btnRef   = useRef<HTMLButtonElement>(null);
  const popRef   = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<PopPos | null>(null);
  const open  = pos !== null;
  const entry = entries?.find(e => e.id === id);

  useEffect(() => {
    if (entries && !entry && import.meta.env.DEV) {
      console.warn(`[help] no entry for id "${id}"`);
    }
  }, [entries, entry, id]);

  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (!entry) return null;

  const allowed = canAct(entry, perms);
  const note    = lockedNote(entry);
  const route   = entry.route;

  function toggle(e: ReactMouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (open) { setPos(null); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(
      Math.max(HELP_POP_GUTTER, r.left - 8),
      window.innerWidth - HELP_POP_WIDTH - HELP_POP_GUTTER,
    );
    setPos({ top: r.bottom + 8, left });
    logHelpEvent({ event: 'open', entry_id: id });
  }

  return (
    <span className={`ex-wrap ex-${variant}`}>
      <button
        ref={btnRef}
        type="button"
        className="ex-btn"
        aria-label={`What is ${entry.title}?`}
        aria-expanded={open}
        onClick={toggle}
      >
        ?
      </button>

      {pos && createPortal(
        <div
          ref={popRef}
          className="ex-pop"
          role="dialog"
          aria-label={entry.title}
          style={{ '--ex-top': `${pos.top}px`, '--ex-left': `${pos.left}px` } as CSSProperties}
          onClick={e => e.stopPropagation()}
        >
          <div className="ex-pop-head">
            <span className="ex-pop-title">{entry.title}</span>
            <button type="button" className="ex-pop-close" aria-label="Close" onClick={() => setPos(null)}>✕</button>
          </div>
          <p className="ex-what">{entry.what}</p>
          {entry.how && <p className="ex-how">{withBold(entry.how)}</p>}
          {entry.where && (
            <p className="ex-where"><span className="ex-where-k">Where</span>{entry.where}</p>
          )}
          {route && allowed && (
            <button type="button" className="ex-go" onClick={() => { setPos(null); navigate(route); }}>
              Take me there →
            </button>
          )}
          {route && !allowed && note && <p className="ex-locked">{note}</p>}
        </div>,
        document.body,
      )}
    </span>
  );
}