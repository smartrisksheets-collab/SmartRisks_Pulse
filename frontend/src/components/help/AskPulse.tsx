import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import type { Permissions } from '../../types/api';
import type { HelpEntry } from '../../types/help';
import { useHelpEntries } from '../../hooks/useHelp';
import { logHelpEvent } from '../../services/help';
import {
  HELP_NO_RESULTS_DELAY_MS, HELP_SHORTCUT_LABEL, HELP_SUPPORT_EMAIL,
  canAct, lockedNote, searchHelp, starterEntries,
} from '../../utils/helpSearch';
import { withBold } from '../../utils/richText';

interface PaletteProps {
  entries:    HelpEntry[] | undefined;
  loading:    boolean;
  perms:      Permissions | null;
  onClose:    () => void;
  onNavigate: (route: string) => void;
}

function AskPulsePalette({ entries, loading, perms, onClose, onNavigate }: PaletteProps) {
  const [q, setQ]               = useState('');
  const [cursor, setCursor]     = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const query = q.trim();

  const results = useMemo<HelpEntry[]>(() => {
    if (!entries) return [];
    return query ? searchHelp(entries, query) : starterEntries(entries);
  }, [entries, query]);

  // A search that finds nothing is the content backlog. Log it once typing settles.
  useEffect(() => {
    if (!query || loading || results.length > 0) return;
    const t = setTimeout(() => logHelpEvent({ event: 'no_results', query }), HELP_NO_RESULTS_DELAY_MS);
    return () => clearTimeout(t);
  }, [query, loading, results.length]);

  function choose(entry: HelpEntry) {
    if (entry.route && canAct(entry, perms)) {
      onNavigate(entry.route);
      return;
    }
    setExpanded(cur => (cur === entry.id ? null : entry.id));
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => Math.min(c + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, 0));
    } else if (e.key === 'Enter' && results[cursor]) {
      e.preventDefault();
      choose(results[cursor]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  return createPortal(
    <div className="ask-overlay" onMouseDown={onClose}>
      <div className="ask-modal" role="dialog" aria-label="Ask Pulse" onMouseDown={e => e.stopPropagation()}>
        <div className="ask-search">
          <span className="ask-search-ico" aria-hidden="true">⌕</span>
          <input
            className="ask-input"
            placeholder="Ask a question or search for a feature…"
            value={q}
            onChange={e => { setQ(e.target.value); setCursor(0); setExpanded(null); }}
            onKeyDown={onKeyDown}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="ask-kbd">esc</kbd>
        </div>

        <div className="ask-results">
          {loading && <div className="ask-sec">Loading…</div>}
          {!loading && !query && <div className="ask-sec">Common questions</div>}

          {results.map((entry, i) => {
            const allowed = canAct(entry, perms);
            const isOpen  = expanded === entry.id;
            const note    = lockedNote(entry);
            return (
              <div key={entry.id} className={`ask-row${i === cursor ? ' is-cur' : ''}`}>
                <button
                  type="button"
                  className="ask-row-main"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(entry)}
                >
                  <span className="ask-row-top">
                    <span className="ask-row-title">{entry.title}</span>
                    <span className="ask-row-group">{entry.group}</span>
                  </span>
                  <span className="ask-row-what">{entry.what}</span>
                  {isOpen && entry.how && <span className="ask-row-how">{withBold(entry.how)}</span>}
                  {isOpen && entry.where && <span className="ask-row-where">{entry.where}</span>}
                  {isOpen && entry.route && !allowed && note && <span className="ask-row-locked">{note}</span>}
                </button>
                {entry.route && allowed && <span className="ask-row-go" aria-hidden="true">↵</span>}
              </div>
            );
          })}

          {!loading && query && results.length === 0 && (
            <div className="ask-empty">
              <p className="ask-empty-h">Nothing matched “{query}”.</p>
              <p className="ask-empty-b">Try the word as it appears on screen, such as appetite, residual, submission or SLA.</p>
              <a
                className="ask-empty-a"
                href={`mailto:${HELP_SUPPORT_EMAIL}?subject=${encodeURIComponent(`Pulse question: ${query}`)}`}
                onClick={() => logHelpEvent({ event: 'contact', query })}
              >
                Email us this question →
              </a>
            </div>
          )}
        </div>

        <div className="ask-foot">
          <span><kbd className="ask-kbd">↑</kbd><kbd className="ask-kbd">↓</kbd> move</span>
          <span><kbd className="ask-kbd">↵</kbd> open</span>
          <span className="ask-foot-r">{entries?.length ?? 0} topics</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function AskPulse() {
  const [open, setOpen] = useState(false);
  const { data: entries, isLoading } = useHelpEntries();
  const perms    = useAuthStore(s => s.claims?.permissions ?? null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button type="button" className="ask-trigger" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="ask-trigger-ico" aria-hidden="true">✦</span>
        Ask Pulse
        <kbd className="ask-kbd">{HELP_SHORTCUT_LABEL}</kbd>
      </button>
      {open && (
        <AskPulsePalette
          entries={entries}
          loading={isLoading}
          perms={perms}
          onClose={() => setOpen(false)}
          onNavigate={route => { setOpen(false); navigate(route); }}
        />
      )}
    </>
  );
}