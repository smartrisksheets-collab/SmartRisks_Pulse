import { useEffect, useReducer, useRef } from 'react';
import { useFeedbackStore } from '../../store/feedbackStore';
import { useAuthStore } from '../../store/authStore';
import { apiPost } from '../../services/api';

const COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function lsKey(event: string, email: string): string {
  return `sr_fb_${event}_${email}`;
}

function inCooldown(event: string, email: string): boolean {
  try {
    const raw = localStorage.getItem(lsKey(event, email));
    if (!raw) return false;
    return Date.now() - parseInt(raw, 10) < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function stampCooldown(event: string, email: string): void {
  try {
    localStorage.setItem(lsKey(event, email), String(Date.now()));
  } catch {
    // localStorage unavailable — skip cooldown stamp
  }
}

// ── Widget state via reducer so the OPEN transition is one dispatch ──────────

type WState = {
  isOpen:     boolean;
  rating:     number;
  hovered:    number;
  comment:    string;
  submitting: boolean;
  submitted:  boolean;
};

type WAction =
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'RATE';    v: number }
  | { type: 'HOVER';   v: number }
  | { type: 'COMMENT'; v: string }
  | { type: 'SUBMITTING' }
  | { type: 'SUBMITTED' };

const INITIAL: WState = {
  isOpen: false, rating: 0, hovered: 0, comment: '', submitting: false, submitted: false,
};

function reducer(s: WState, a: WAction): WState {
  switch (a.type) {
    case 'OPEN':       return { ...INITIAL, isOpen: true };
    case 'CLOSE':      return { ...s, isOpen: false };
    case 'RATE':       return { ...s, rating:     a.v };
    case 'HOVER':      return { ...s, hovered:    a.v };
    case 'COMMENT':    return { ...s, comment:    a.v };
    case 'SUBMITTING': return { ...s, submitting: true };
    case 'SUBMITTED':  return { ...s, submitting: false, submitted: true };
    default:           return s;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FeedbackWidget() {
  const event  = useFeedbackStore(s => s.event);
  const label  = useFeedbackStore(s => s.label);
  const clear  = useFeedbackStore(s => s.clear);
  const claims = useAuthStore(s => s.claims);

  const [s, dispatch] = useReducer(reducer, INITIAL);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventRef = useRef('');

  useEffect(() => {
    if (!event) return;

    const email = claims?.email ?? 'anon';

    if (inCooldown(event, email)) {
      clear();
      return;
    }

    eventRef.current = event;
    dispatch({ type: 'OPEN' }); // single dispatch — one re-render

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => closeWidget(false), 20_000);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [event]); // eslint-disable-line react-hooks/exhaustive-deps

  function closeWidget(withCooldown: boolean) {
    dispatch({ type: 'CLOSE' });
    if (timerRef.current) clearTimeout(timerRef.current);
    if (withCooldown) {
      stampCooldown(eventRef.current, claims?.email ?? 'anon');
    }
    setTimeout(() => clear(), 500);
  }

  async function handleSubmit() {
    if (!s.rating) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    dispatch({ type: 'SUBMITTING' });

    try {
      await apiPost('/api/v1/feedback', {
        event_key: eventRef.current,
        rating:    s.rating,
        comment:   s.comment.trim() || null,
      });
    } catch {
      // submit errors never block the thanks state
    }

    stampCooldown(eventRef.current, claims?.email ?? 'anon');
    dispatch({ type: 'SUBMITTED' });

    timerRef.current = setTimeout(() => {
      dispatch({ type: 'CLOSE' });
      setTimeout(() => clear(), 500);
    }, 2200);
  }

  const widgetClass = `sr-fb-widget${s.isOpen ? ' sr-fb-open' : ''}`;

  return (
    <div className={widgetClass} role="dialog" aria-label="Feedback" aria-hidden={!s.isOpen}>
      <div className="sr-fb-hd">
        <div className="sr-fb-hd-text">
          <div className="sr-fb-hd-eyebrow">SmartRisk</div>
          <div className="sr-fb-hd-title">{label ?? 'How was your experience?'}</div>
        </div>
        <button className="sr-fb-x" onClick={() => closeWidget(true)} aria-label="Close">
          ✕
        </button>
      </div>

      {s.submitted ? (
        <div className="sr-fb-thanks">
          <div className="sr-fb-thanks-icon">✓</div>
          <div className="sr-fb-thanks-msg">Thanks for your feedback!</div>
          <div className="sr-fb-thanks-sub">It helps us improve SmartRisk.</div>
        </div>
      ) : (
        <div className="sr-fb-bd">
          <div className="sr-fb-stars">
            {[1, 2, 3, 4, 5].map(v => (
              <span
                key={v}
                className={[
                  'sr-fb-star',
                  v <= s.rating                  ? 'lit'  : '',
                  v > s.rating && v <= s.hovered ? 'peek' : '',
                ].filter(Boolean).join(' ')}
                onMouseEnter={() => dispatch({ type: 'HOVER',   v })}
                onMouseLeave={() => dispatch({ type: 'HOVER',   v: 0 })}
                onClick={()       => dispatch({ type: 'RATE',   v })}
              >
                ★
              </span>
            ))}
          </div>
          <div className="sr-fb-scale">
            <span>Very dissatisfied</span>
            <span>Very satisfied</span>
          </div>
          <textarea
            className="sr-fb-comment"
            rows={2}
            placeholder="Tell us more… (optional)"
            maxLength={500}
            value={s.comment}
            onChange={e => dispatch({ type: 'COMMENT', v: e.target.value })}
          />
          <div className="sr-fb-ft">
            <button className="sr-fb-skip" onClick={() => closeWidget(true)}>
              Skip
            </button>
            <button
              className="sr-fb-submit"
              onClick={handleSubmit}
              disabled={s.submitting}
            >
              {s.submitting ? 'Sending…' : 'Submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}