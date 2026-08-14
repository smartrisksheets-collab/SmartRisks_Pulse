// src/components/risks/RiskTable.tsx

import { useState } from 'react';
import type { Risk } from '../../types/risk';

interface Props {
  risks:        Risk[];
  loading:      boolean;
  onView:       (r: Risk) => void;
  flashId?:     string | null;
  aiFlashIds?:  Set<string>;
  selectedIds:  Set<string>;
  onToggle:     (id: string) => void;
  onToggleAll:  () => void;
}

// Index-based badge class: 4=vhigh, 3=high, 2=med, 1=low
function levelBadgeClass(index: number | null): string {
  const map: Record<number, string> = { 5: 'extreme', 4: 'vhigh', 3: 'high', 2: 'med', 1: 'low' };
  return map[index ?? 1] ?? 'low';
}

// Movement delta
const MOV_CFG: Record<string, { ico: string; cls: string }> = {
  Increasing: { ico: '↑', cls: 'warn' },
  Improving:  { ico: '↓', cls: 'up'   },
  Volatile:   { ico: '⚠', cls: 'down' },
};

function freshnessColor(f: string | null): string {
  if (f === 'Stale') return '#ef4444';
  if (f === 'Aging') return '#f59e0b';
  return '#10b981';
}

// Parse AI insight string into parts
function parseAI(ai: string | null): { text: string; conf: string; stat: string } | null {
  if (!ai?.trim()) return null;
  const lines   = ai.split('\n');
  const text    = lines[0] ?? '';
  const confLine = lines.find(l => l.startsWith('Confidence:')) ?? '';
  const statLine = lines.find(l => l.startsWith('Status:'))     ?? '';
  return {
    text,
    conf: confLine.replace('Confidence:', '').trim(),
    stat: statLine.replace('Status:', '').trim(),
  };
}

const CONF_COLORS: Record<string, string> = { High: '#22c55e', Medium: '#f97316', Low: '#94a3b8' };
const STAT_COLORS: Record<string, string> = { Escalate: '#ef4444', Monitor: '#f97316', Review: '#eab308', Stable: '#22c55e' };

const FRESH_META: Record<string, { title: string; sub: string }> = {
  Fresh: { title: 'FRESH',  sub: 'Risk reviewed recently — up to date'     },
  Aging: { title: 'AGING',  sub: 'Risk review approaching — check soon'    },
  Stale: { title: 'STALE',  sub: 'Risk overdue for review — action needed' },
};

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

export default function RiskTable({ risks, loading, onView, flashId, aiFlashIds, selectedIds, onToggle, onToggleAll }: Props) {
  const [freshTip, setFreshTip] = useState<{ id: string; x: number; y: number } | null>(null);
  if (loading && !risks.length) {
    return (
      <div className="table-wrap">
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>Loading risks...</div>
      </div>
    );
  }

  if (!risks.length) {
    return (
      <div className="table-wrap">
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
          No risks found. Add your first risk to get started.
        </div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: 36 }} onClick={e => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={risks.length > 0 && risks.every(r => selectedIds.has(r.id))}
                onChange={onToggleAll}
                title="Select all on this page"
              />
            </th>
            <th style={{ width: 90 }}>Risk ID</th>
            <th style={{ width: 100 }}>Date Logged</th>
            <th>Description</th>
            <th style={{ width: 120 }}>Owner</th>
            <th style={{ width: 70, textAlign: 'center' }}>Severity</th>
            <th style={{ width: 90 }}>Level</th>
            <th style={{ width: 90 }}>Treatment</th>
            <th style={{ width: 90, textAlign: 'center' }}>Residual</th>
            <th style={{ width: 200 }}>AI Insights</th>
          </tr>
        </thead>
        <tbody id="riskBody">
          {risks.map(r => {
            const mov  = MOV_CFG[r.movement ?? ''];
            const ai   = parseAI(r.ai_insight);
            const delta = r.score_delta ?? 0;

            return (
              <tr
                key={r.id}
                data-riskid={r.id}
                className={`tr-clickable${flashId === r.id || (aiFlashIds?.has(r.id) ?? false) ? ' row-flash' : ''}`}
                onClick={() => onView(r)}
              >
                {/* Checkbox */}
                <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(r.id)}
                    onChange={() => onToggle(r.id)}
                  />
                </td>
                {/* Risk ID + source badge */}
                <td>
                  <span style={{ fontWeight: 900, color: '#01b88e', fontSize: 13 }}>{r.id}</span>
                  <br />
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px',
                    borderRadius: 4,
                    background: r.source === 'external' ? 'rgba(1,184,142,.15)' : '#dbeafe',
                    color: r.source === 'external' ? '#01b88e' : '#1d4ed8',
                    display: 'inline-block', marginTop: 2,
                  }}>
                    {r.source === 'external' ? 'External' : 'Internal'}
                  </span>
                </td>

                {/* Date Logged */}
                <td className="date-col" style={{ fontSize: 12 }}>
                  {r.logged_at ?? '—'}
                </td>

                {/* Description + owner hint */}
                <td style={{ maxWidth: 260 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, display: 'block' }}>
                    {r.description ?? '—'}
                  </span>
                </td>

                {/* Owner */}
                <td style={{ fontSize: 12 }}>{r.owner ?? '—'}</td>

                {/* Severity */}
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{r.severity ?? '—'}</td>

                {/* Level badge */}
                <td>
                  <span className={`badge ${levelBadgeClass(r.level_index)}`}>{r.level ?? '—'}</span>
                </td>

                {/* Treatment */}
                <td style={{ fontSize: 12 }}>{r.treatment ?? '—'}</td>

                {/* Residual + movement delta + freshness */}
                <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                  <b>{r.residual != null ? Math.round(r.residual) : '—'}</b>
                  {mov && (
                    <span className={`sr-delta ${mov.cls}`} style={{ marginLeft: 4 }}>
                      {mov.ico} {delta > 0 ? '+' : ''}{delta}
                    </span>
                  )}
                  {r.freshness && (() => {
                    const fc    = freshnessColor(r.freshness);
                    const meta  = FRESH_META[r.freshness];
                    const days  = daysSince(r.last_reviewed_at);
                    const tipId = r.id + '-fresh';
                    return (
                      <>
                        <br />
                        <span
                          className="fresh-wrap"
                          onMouseEnter={e => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setFreshTip({ id: tipId, x: r.left, y: r.bottom + 6 });
                          }}
                          onMouseLeave={() => setFreshTip(null)}
                        >
                          <span
                            className="fresh-badge"
                            style={{ color: fc, textDecoration: 'underline', textDecorationStyle: 'dashed', textDecorationColor: fc }}
                          >
                            {r.freshness}
                          </span>
                          {freshTip?.id === tipId && meta && (
                            <div
                              className={`fresh-tip ${r.freshness?.toLowerCase() ?? ''}`}
                              style={{ top: freshTip.y, left: freshTip.x }}
                            >
                              <div className="fresh-tip-title" style={{ color: fc }}>{meta.title}</div>
                              <div className="fresh-tip-sub">{meta.sub}</div>
                              <div className="fresh-tip-row">
                                <span className="fresh-tip-lbl">Last reviewed</span>
                                <span className="fresh-tip-val">{r.last_reviewed_at ? r.last_reviewed_at.slice(0, 10) : '—'}</span>
                              </div>
                              <div className="fresh-tip-row">
                                <span className="fresh-tip-lbl">Days since</span>
                                <span className={`fresh-tip-val${days === 0 ? ' accent' : ''}`}>{days} {days === 1 ? 'day' : 'days'} ago</span>
                              </div>
                              <div className="fresh-tip-row">
                                <span className="fresh-tip-lbl">Owner</span>
                                <span className="fresh-tip-val">{r.owner ?? '—'}</span>
                              </div>
                            </div>
                          )}
                        </span>
                      </>
                    );
                  })()}
                </td>

                {/* AI Insights */}
                <td style={{ maxWidth: 200 }} onClick={e => e.stopPropagation()}>
                  {ai ? (
                    <>
                      <span style={{
                        fontSize: 11,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      } as React.CSSProperties}>
                        {ai.text}
                      </span>
                      {ai.conf && (
                        <span style={{ fontSize: 10, color: CONF_COLORS[ai.conf] ?? '#94a3b8', display: 'block' }}>
                          Confidence: {ai.conf}
                        </span>
                      )}
                      {ai.stat && (
                        <span style={{ fontSize: 10, color: STAT_COLORS[ai.stat] ?? '#94a3b8', display: 'block' }}>
                          Status: {ai.stat}
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}