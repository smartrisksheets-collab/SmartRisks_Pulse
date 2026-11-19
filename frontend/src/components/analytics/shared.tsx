// src/components/analytics/shared.tsx
// Small building blocks shared by the Analytics tabs. Every value shown is
// computed by the backend; these helpers only pick chip colours and draw.

import type { ReactNode } from 'react';
import type { RecommendedAction, ScoreComponent } from '../../types/dashboard';
import { formatDate } from '../../utils/format';

export function Card({ label, title, intro, right, children }: {
  label?: string;
  title?: string;
  intro?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="pl-card pl-stack" aria-label={title ?? label}>
      {(label || title || right) && (
        <div className="pl-an-head">
          <div className="pl-stack-xs">
            {label && <p className="pl-label">{label}</p>}
            {title && <h2 className="pl-section">{title}</h2>}
            {intro && <p className="pl-intro">{intro}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** Score parts, each 0 to 100, with their weights. */
export function ScoreBars({ components, higherIsWorse }: { components: ScoreComponent[]; higherIsWorse: boolean }) {
  return (
    <div className="pl-stack-xs">
      {components.map(c => {
        const warn = higherIsWorse ? c.score >= 60 : c.score < 40;
        return (
          <div key={c.name} className="pl-comp">
            <span>
              {c.name}
              <span className="pl-meta"> · weight {c.weight}%</span>
            </span>
            <span className={`pl-bar${warn ? ' pl-warn' : ''}`} aria-hidden="true">
              <span style={{ ['--pl-fill' as string]: `${c.suppressed ? 0 : c.score}%` }} />
            </span>
            <b className="pl-num">{c.suppressed ? 'n/a' : c.score}</b>
          </div>
        );
      })}
      {components.some(c => c.suppressed) && (
        <p className="pl-caption">Parts marked n/a have no data yet. Their weight is shared across the others.</p>
      )}
    </div>
  );
}

export function ActionList({ actions, emptyText }: { actions: RecommendedAction[]; emptyText: string }) {
  if (actions.length === 0) return <p className="pl-caption">{emptyText}</p>;
  return (
    <div className="pl-stack-xs">
      {actions.map(a => {
        const meta = [a.owner, a.due ? `Due ${formatDate(a.due)}` : null].filter(Boolean).join(' · ');
        return (
          <div key={a.key} className="pl-act">
            <div className="pl-an-head">
              <p className="pl-item-title">{a.title}</p>
              {meta && <span className="pl-meta">{meta}</span>}
            </div>
            <p className="pl-p">{a.detail}</p>
            <p className="pl-done">Done when: {a.done_when}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────────
// Plain SVG on a fixed 600 x 200 canvas, scaled to the card width.

const W = 600;
const H = 200;
const PAD = { l: 36, r: 12, t: 16, b: 28 };

interface Pt { label: string; value: number | null }

function scaleY(v: number, max: number): number {
  return PAD.t + (H - PAD.t - PAD.b) * (1 - v / Math.max(max, 1e-9));
}

// Band centres, so bars never sit on the y-axis labels and both charts line up by month.
function xAt(i: number, n: number): number {
  const span = W - PAD.l - PAD.r;
  return PAD.l + (span * (i + 0.5)) / Math.max(n, 1);
}

function Grid({ max, fmt }: { max: number; fmt: (v: number) => string }) {
  const ticks = [0, max / 2, max];
  return (
    <g className="pl-grid">
      {ticks.map(t => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={scaleY(t, max)} y2={scaleY(t, max)} />
          <text className="pl-axis" x={PAD.l - 6} y={scaleY(t, max) + 4} textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
    </g>
  );
}

export function LineChart({ points, max, label, threshold }: {
  points: Pt[];
  max: number;
  label: string;
  threshold?: number | null;
}) {
  const n = points.length;
  const segs: string[] = [];
  let cur = '';
  points.forEach((p, i) => {
    if (p.value == null) { if (cur) segs.push(cur); cur = ''; return; }
    cur += `${cur ? 'L' : 'M'}${xAt(i, n)},${scaleY(p.value, max)}`;
  });
  if (cur) segs.push(cur);
  return (
    <svg className="pl-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <Grid max={max} fmt={v => (Number.isInteger(v) ? String(v) : v.toFixed(1))} />
      {threshold != null && threshold <= max && (
        <line className="pl-chart-thr" x1={PAD.l} x2={W - PAD.r} y1={scaleY(threshold, max)} y2={scaleY(threshold, max)} />
      )}
      {segs.map(d => <path key={d} className="pl-chart-line" d={d} />)}
      {points.map((p, i) => (
        <g key={p.label}>
          {p.value != null && (
            <>
              <circle className="pl-chart-dot" cx={xAt(i, n)} cy={scaleY(p.value, max)} r={4} />
              <text className="pl-value" x={xAt(i, n)} y={scaleY(p.value, max) - 9} textAnchor="middle">{p.value}</text>
            </>
          )}
          <text className="pl-axis" x={xAt(i, n)} y={H - 8} textAnchor="middle">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

export function BarChart({ points, label }: { points: Pt[]; label: string }) {
  const n = points.length;
  const max = Math.max(1, ...points.map(p => p.value ?? 0));
  const bw = Math.min(48, ((W - PAD.l - PAD.r) / Math.max(n, 1)) * 0.5);
  return (
    <svg className="pl-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <Grid max={max} fmt={v => (Number.isInteger(v) ? String(v) : '')} />
      {points.map((p, i) => {
        const v = p.value ?? 0;
        const y = scaleY(v, max);
        return (
          <g key={p.label}>
            <rect className="pl-chart-bar" x={xAt(i, n) - bw / 2} y={y} width={bw} height={H - PAD.b - y} rx={4} />
            <text className="pl-value" x={xAt(i, n)} y={y - 6} textAnchor="middle">{v}</text>
            <text className="pl-axis" x={xAt(i, n)} y={H - 8} textAnchor="middle">{p.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const known = values.filter((v): v is number => v != null);
  if (known.length < 2) return <span className="pl-caption">Not enough months yet</span>;
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const n = values.length;
  const sw = 120;
  const sh = 32;
  let d = '';
  values.forEach((v, i) => {
    if (v == null) return;
    const x = n <= 1 ? sw / 2 : (sw * i) / (n - 1);
    const y = hi === lo ? sh / 2 : 4 + (sh - 8) * (1 - (v - lo) / (hi - lo));
    d += `${d ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg className="pl-spark" viewBox={`0 0 ${sw} ${sh}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path className="pl-chart-line" d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
