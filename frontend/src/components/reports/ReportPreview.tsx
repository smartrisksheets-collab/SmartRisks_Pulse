// src/components/reports/ReportPreview.tsx
// Translates GAS renderBlockData_() into React JSX per block type.
// Source: View_ReportBuilder.html renderBlockData_() lines 1200-1778.

import type {
  BlockKey,
  BlockDataMap,
  ExposureIndexData,
  RiskSnapshotData,
  KeyRiskChangesData,
  IncidentStabilityData,
  AIExecSummaryData,
  ExecutiveCommentaryData,
  TrendData,
  RiskDistributionData,
  TopRisksData,
  MajorIncidentsData,
  FindingsData,
  RecommendationsData,
  ConclusionData,
  RiskOwnershipData,
  IncidentAnalyticsData,
  ExecutiveDashboardData,
  KeyRiskMovementsData,
} from '../../types/report';

// ── Shared helpers ─────────────────────────────────────────────────────────────

function levelColor(level: string): string {
  const l = (level || '').toLowerCase();
  if (l === 'very high' || l === 'critical') return '#dc2626';
  if (l === 'high')   return '#ef4444';
  if (l === 'medium') return '#f59e0b';
  return '#10b981';
}

function trendArrow(movement: string): string {
  const m = (movement || '').toLowerCase();
  if (m === 'increasing' || m === 'volatile') return '▲';
  if (m === 'improving') return '▼';
  return '→';
}

function trendArrowColor(movement: string): string {
  const m = (movement || '').toLowerCase();
  if (m === 'increasing' || m === 'volatile') return '#ef4444';
  if (m === 'improving') return '#10b981';
  return '#94a3b8';
}

interface NarrativeTAProps {
  blockKey: string;
  value:    string;
  onEdit:   (key: string, val: string) => void;
}

function NarrativeTA({ blockKey, value, onEdit }: NarrativeTAProps) {
  return (
    <textarea
      className="rb-narrative-ta"
      value={value}
      placeholder="Edit narrative…"
      onChange={(e) => onEdit(blockKey, e.target.value)}
    />
  );
}

function KPIBox({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div className="rb-kpi-box">
      <div className="rb-kpi-val" style={color ? { color } : undefined}>{value}</div>
      <div className="rb-kpi-lbl">{label}</div>
    </div>
  );
}


function AIPlaceholder() {
  return <p className="rb-ai-placeholder">Click "Generate AI Narrative" to enhance this block.</p>;
}

// ── Block renderers ─────────────────────────────────────────────────────────────

function ExposureIndex({ data, onEdit }: { data: ExposureIndexData; onEdit: (k: string, v: string) => void }) {
  const health = data.health ?? (100 - data.score);
  const hColor = data.health_color || '#10b981';
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, padding: '10px 0 6px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Risk Health</div>
          <div style={{ fontSize: 48, fontWeight: 800, color: hColor, lineHeight: 1 }}>{health}</div>
          <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: 999, background: hColor + '1a', color: hColor, fontSize: 12, fontWeight: 700, marginTop: 4 }}>{data.health_label}</span>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>/ 100 — higher is better</div>
        </div>
        <div style={{ width: 1, height: 64, background: '#e2e8f0', flexShrink: 0 }} />
        <div style={{ textAlign: 'center', opacity: 0.75 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Exposure Index</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#1F2854', lineHeight: 1 }}>{data.score}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>/ 100 — <strong style={{ color: '#475569' }}>{data.label}</strong></div>
        </div>
      </div>
      <NarrativeTA blockKey="exposure-index" value={data.narrative || ''} onEdit={onEdit} />
    </>
  );
}

function RiskSnapshot({ data, onEdit }: { data: RiskSnapshotData; onEdit: (k: string, v: string) => void }) {
  return (
    <>
      <div className="rb-kpi-row" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <KPIBox value={data.total}        label="Total Risks"    color="#1F2854" />
        <KPIBox value={data.high_count}   label="High / Critical" color="#ef4444" />
        <KPIBox value={data.avg_residual} label="Avg Residual"   color="#f59e0b" />
      </div>
      <NarrativeTA blockKey="risk-snapshot" value={data.narrative || ''} onEdit={onEdit} />
    </>
  );
}

function KeyRiskChanges({ data, onEdit }: { data: KeyRiskChangesData; onEdit: (k: string, v: string) => void }) {
  return (
    <>
      <div className="rb-kpi-row" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <KPIBox value={`+${data.increased}`}    label="Risks Increased" />
        <KPIBox value={`−${data.decreased}`}    label="Risks Decreased" />
        <KPIBox value={data.new_high_risks}      label="New High Risks"  color="#ef4444" />
      </div>
      {data.note && <p className="rb-narrative">{data.note}</p>}
      {data.narrative && <NarrativeTA blockKey="key-risk-changes" value={data.narrative} onEdit={onEdit} />}
    </>
  );
}

function IncidentStability({ data, onEdit }: { data: IncidentStabilityData; onEdit: (k: string, v: string) => void }) {
  return (
    <>
      <div className="rb-kpi-row" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <KPIBox value={data.total}               label="Total"       color="#1F2854" />
        <KPIBox value={data.open}                label="Open"        color="#ef4444" />
        <KPIBox value={data.closed}              label="Closed"      color="#10b981" />
        <KPIBox value={data.mttr_days ?? '—'}    label="MTTR (days)" color="#f59e0b" />
      </div>
      <NarrativeTA blockKey="incident-stability" value={data.narrative || ''} onEdit={onEdit} />
    </>
  );
}

function AIExecSummary({ data, ai, onEdit }: { data: AIExecSummaryData; ai?: string; onEdit: (k: string, v: string) => void }) {
  const value = ai ?? (data.paragraphs || []).join('\n');
  return (
    <textarea
      className="rb-narrative-ta"
      style={{ minHeight: 80 }}
      value={value}
      placeholder="AI summary will appear here. Edit as needed."
      onChange={(e) => onEdit('ai-exec-summary', e.target.value)}
    />
  );
}

function ExecutiveCommentary({ data, ai, onEdit }: { data: ExecutiveCommentaryData; ai?: string; onEdit: (k: string, v: string) => void }) {
  const value = ai ?? data.text ?? '';
  return (
    <textarea
      className="rb-narrative-ta"
      style={{ minHeight: 96 }}
      value={value}
      placeholder="Enter executive commentary, or use Generate AI Narrative."
      onChange={(e) => onEdit('executive-commentary', e.target.value)}
    />
  );
}

function SimpleTrendChart({ points, valueKey, color }: { points: Array<{ label: string; score?: number; avg?: number; count?: number }>; valueKey: string; color: string }) {
  const vals  = points.map((p) => Number((p as Record<string, unknown>)[valueKey]) || 0);
  const max   = Math.max(...vals, 1);
  const W     = 680;
  const H     = 90;
  const PAD   = 16;
  const GAP   = 3;
  const n     = points.length || 1;
  const bw    = Math.max(8, Math.floor((W - PAD * 2 - GAP * (n - 1)) / n));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {points.map((pt, i) => {
        const val = vals[i];
        const bh  = Math.max(2, Math.round((val / max) * (H - 22)));
        const x   = PAD + i * (bw + GAP);
        const y   = H - 16 - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={bh} fill={color} rx={2} />
            <text x={x + bw / 2} y={y - 2} textAnchor="middle" fontSize={8} fill="#64748b">{val}</text>
            <text x={x + bw / 2} y={H - 2} textAnchor="middle" fontSize={7} fill="#94a3b8">{pt.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function ExposureTrend({ data, onEdit }: { data: TrendData; onEdit: (k: string, v: string) => void }) {
  return (
    <>
      <SimpleTrendChart points={data.points || []} valueKey="score" color="#01b88e" />
      <NarrativeTA blockKey="exposure-trend" value={data.narrative || ''} onEdit={onEdit} />
    </>
  );
}

function ResidualRiskTrend({ data, onEdit }: { data: TrendData; onEdit: (k: string, v: string) => void }) {
  return (
    <>
      <SimpleTrendChart points={data.points || []} valueKey="avg" color="#1F2854" />
      <NarrativeTA blockKey="residual-risk-trend" value={data.narrative || ''} onEdit={onEdit} />
    </>
  );
}

function IncidentTrend({ data, onEdit }: { data: TrendData; onEdit: (k: string, v: string) => void }) {
  return (
    <>
      <SimpleTrendChart points={data.points || []} valueKey="count" color="#f59e0b" />
      <NarrativeTA blockKey="incident-trend" value={data.narrative || ''} onEdit={onEdit} />
    </>
  );
}

// Translated from GAS svgDonut_() in View_ReportBuilder.html
function DonutChart({ byLevel }: { byLevel: Record<string, number> }) {
  const ORDER = ['Low', 'Medium', 'High', 'Very High', 'Critical'];
  const COLORS: Record<string, string> = {
    Low: '#10b981', Medium: '#f59e0b', High: '#ef4444',
    'Very High': '#dc2626', Critical: '#dc2626',
  };
  const slices = ORDER
    .filter((k) => (byLevel[k] || 0) > 0)
    .map((k) => ({ label: k, value: byLevel[k] || 0, color: COLORS[k] || '#94a3b8' }));
  const total = slices.reduce((s, sl) => s + sl.value, 0) || 1;

  const CX = 80, CY = 80, R = 60, r = 36, H = 160;

  const arcPaths: { key: string; d: string; fill: string }[] = [];
  if (slices.length > 1) {
    let angle = -Math.PI / 2;
    for (const sl of slices) {
      const sweep = (sl.value / total) * 2 * Math.PI;
      const x1  = CX + R * Math.cos(angle);
      const y1  = CY + R * Math.sin(angle);
      angle    += sweep;
      const x2  = CX + R * Math.cos(angle);
      const y2  = CY + R * Math.sin(angle);
      const xi1 = CX + r * Math.cos(angle);
      const yi1 = CY + r * Math.sin(angle);
      const xi2 = CX + r * Math.cos(angle - sweep);
      const yi2 = CY + r * Math.sin(angle - sweep);
      const lg  = sweep > Math.PI ? 1 : 0;
      arcPaths.push({
        key:  sl.label,
        d:    `M${x1},${y1} A${R},${R} 0 ${lg},1 ${x2},${y2} L${xi1},${yi1} A${r},${r} 0 ${lg},0 ${xi2},${yi2} Z`,
        fill: sl.color,
      });
    }
  }

  return (
    <svg
      viewBox={`0 0 420 ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', maxWidth: 320, height: 'auto', display: 'block' }}
    >
      {slices.length === 1 ? (
        <>
          <circle cx={CX} cy={CY} r={R} fill={slices[0].color} />
          <circle cx={CX} cy={CY} r={r} fill="#fff" />
        </>
      ) : (
        arcPaths.map((arc) => <path key={arc.key} d={arc.d} fill={arc.fill} />)
      )}
      <text x={CX} y={CY + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill="#0f172a">
        {total}
      </text>
      <text x={CX} y={CY + 16} textAnchor="middle" fontSize={9} fill="#64748b">
        Total
      </text>
      {slices.map((sl, k) => (
        <g key={sl.label}>
          <rect x={170} y={12 + k * 20} width={10} height={10} fill={sl.color} rx={2} />
          <text x={185} y={21 + k * 20} fontSize={11} fill="#334155">
            {`${sl.label}: ${sl.value} (${Math.round((sl.value / total) * 100)}%)`}
          </text>
        </g>
      ))}
    </svg>
  );
}

function RiskDistribution({ data, onEdit }: { data: RiskDistributionData; onEdit: (k: string, v: string) => void }) {
  const byLevel    = data.by_level    || {};
  const byCategory = data.by_category || {};
  return (
    <>
      <div className="rp-grid-2">
        <div>
          <DonutChart byLevel={byLevel} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>BY CATEGORY</div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <tbody>
              {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cat, cnt]) => (
                <tr key={cat} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '4px 6px', color: '#334155' }}>{cat}</td>
                  <td style={{ padding: '4px 6px', fontWeight: 700, textAlign: 'right' }}>{cnt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <NarrativeTA blockKey="risk-distribution" value={data.narrative || ''} onEdit={onEdit} />
    </>
  );
}

function TopRisksTable({ data, ai, blockKey, onEdit }: { data: TopRisksData; ai?: string; blockKey: string; onEdit: (k: string, v: string) => void }) {
  return (
    <>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{data.intro}</p>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {['ID', 'Dept / Risk Owner', 'Description', 'Level', 'Residual', 'Trend'].map((h) => (
              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(data.risks || []).map((r) => (
            <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={{ padding: '6px 8px', fontWeight: 700, color: '#1F2854' }}>{r.id}</td>
              <td style={{ padding: '6px 8px', color: '#475569' }}>{r.owner || '—'}</td>
              <td style={{ padding: '6px 8px' }}>{(r.desc || '').substring(0, 80)}</td>
              <td style={{ padding: '6px 8px', fontWeight: 700, color: levelColor(r.level) }}>{r.level}</td>
              <td style={{ padding: '6px 8px' }}>{r.residual}</td>
              <td style={{ padding: '6px 8px', color: trendArrowColor(r.movement) }}>{trendArrow(r.movement)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <NarrativeTA blockKey={blockKey} value={ai ?? ''} onEdit={onEdit} />
    </>
  );
}

function MajorIncidentsTable({ data, ai, onEdit }: { data: MajorIncidentsData; ai?: string; onEdit: (k: string, v: string) => void }) {
  return (
    <>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{data.intro}</p>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {['ID', 'Description', 'Severity', 'Status'].map((h) => (
              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(data.incidents || []).map((inc) => (
            <tr key={inc.id} style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={{ padding: '6px 8px', fontWeight: 700, color: '#1F2854' }}>{inc.id}</td>
              <td style={{ padding: '6px 8px' }}>{(inc.desc || '').substring(0, 80)}</td>
              <td style={{ padding: '6px 8px', fontWeight: 700, color: levelColor(inc.severity) }}>{inc.severity}</td>
              <td style={{ padding: '6px 8px' }}>{inc.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <NarrativeTA blockKey="major-incidents" value={ai ?? ''} onEdit={onEdit} />
    </>
  );
}

function FindingSection({ items, label, color }: { items: string[]; label: string; color: string }) {
  if (!items?.length) return null;
  return (
    <>
      <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.06em', margin: '10px 0 4px' }}>{label}</div>
      {items.map((f, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
          <span style={{ color, fontWeight: 700, flexShrink: 0 }}>●</span>
          <span style={{ fontSize: 12, color: '#334155' }}>{f}</span>
        </div>
      ))}
    </>
  );
}

function FindingsBlock({ data }: { data: FindingsData }) {
  return (
    <>
      <FindingSection items={data.positive_signals || []}    label="Positive Signals"           color="#10b981" />
      <FindingSection items={data.key_risks || []}            label="Key Risks"                  color="#ef4444" />
      <FindingSection items={data.areas_for_attention || []} label="Areas Requiring Attention"   color="#f59e0b" />
      {!data.positive_signals?.length && !data.key_risks?.length && !data.areas_for_attention?.length && (
        (data.findings || []).map((f, i) => (
          <div key={i} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>● {f}</div>
        ))
      )}
    </>
  );
}

function RecommendationsBlock({ data, ai, onEdit }: { data: RecommendationsData; ai?: string; onEdit: (k: string, v: string) => void }) {
  if (ai) return <NarrativeTA blockKey="recommendations" value={ai} onEdit={onEdit} />;
  return (
    <>
      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{data.intro}</p>
      {(data.recommendations || []).map((r, i) => {
        const title = typeof r === 'string' ? r : r.title;
        const body  = typeof r === 'string' ? '' : r.body;
        const meta  = typeof r === 'string' ? '' : `${r.priority} · ${r.owner} · ${r.due}`;
        return (
          <div key={i} style={{ marginBottom: 10, padding: '10px 12px', background: '#f8faff', borderLeft: '3px solid #01b88e', borderRadius: '0 6px 6px 0' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#01b88e', marginBottom: 4 }}>Action {i + 1}: {title}</div>
            {meta && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{meta}</div>}
            {body && <div style={{ fontSize: 11, color: '#334155', lineHeight: 1.5 }}>{body}</div>}
          </div>
        );
      })}
      {!data.recommendations?.length && <AIPlaceholder />}
    </>
  );
}

function ConclusionBlock({ data, onEdit }: { data: ConclusionData; onEdit: (k: string, v: string) => void }) {
  return (
    <textarea
      className="rb-narrative-ta"
      style={{ minHeight: 72 }}
      value={data.text || ''}
      onChange={(e) => onEdit('conclusion', e.target.value)}
    />
  );
}

function RiskOwnershipBlock({ data, onEdit }: { data: RiskOwnershipData; onEdit: (k: string, v: string) => void }) {
  return (
    <>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {['Dept/Risk Owner', 'High Risks', 'Total', 'Avg Residual', 'Top Category'].map((h) => (
              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(data.top_owners || []).map((o) => (
            <tr key={o.owner} style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={{ padding: '6px 8px', fontWeight: 600 }}>{o.owner}</td>
              <td style={{ padding: '6px 8px', fontWeight: 700, color: '#ef4444' }}>{o.high_count}</td>
              <td style={{ padding: '6px 8px' }}>{o.total_count}</td>
              <td style={{ padding: '6px 8px' }}>{o.avg_residual}</td>
              <td style={{ padding: '6px 8px', fontSize: 11, color: '#64748b' }}>{o.top_category}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.concentration > 0 && (
        <p style={{ fontSize: 11, color: '#64748b' }}>
          Top 3 owners hold <strong style={{ color: '#ef4444' }}>{data.concentration}%</strong> of all high-risk items.
        </p>
      )}
      <NarrativeTA blockKey="risk-ownership" value={data.narrative || ''} onEdit={onEdit} />
    </>
  );
}

function IncidentAnalyticsBlock({ data, onEdit }: { data: IncidentAnalyticsData; onEdit: (k: string, v: string) => void }) {
  return (
    <>
      <div className="rb-kpi-row" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 12 }}>
        <KPIBox value={data.total}            label="Total"       color="#1F2854" />
        <KPIBox value={data.open}             label="Open"        color="#ef4444" />
        <KPIBox value={data.closed}           label="Closed"      color="#10b981" />
        <KPIBox value={data.mttr_days ?? '—'} label="MTTR (days)" color="#f59e0b" />
      </div>
      <div className="rp-grid-2">
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>BY CATEGORY</div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <tbody>
              {Object.entries(data.by_category || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([cat, cnt]) => (
                <tr key={cat} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '4px 6px', color: '#334155' }}>{cat}</td>
                  <td style={{ padding: '4px 6px', fontWeight: 700, textAlign: 'right' }}>{cnt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>BY SEVERITY</div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <tbody>
              {Object.entries(data.by_severity || {}).sort((a, b) => b[1] - a[1]).map(([sev, cnt]) => (
                <tr key={sev} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '4px 6px', fontWeight: 700, color: levelColor(sev) }}>{sev}</td>
                  <td style={{ padding: '4px 6px', fontWeight: 700, textAlign: 'right' }}>{cnt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <NarrativeTA blockKey="incident-analytics" value={data.narrative || ''} onEdit={onEdit} />
    </>
  );
}

function ExecutiveDashboardBlock({ data, ai, onEdit }: { data: ExecutiveDashboardData; ai?: string; onEdit: (k: string, v: string) => void }) {
  if (data.no_data) {
    return (
      <div style={{ textAlign: 'center', padding: '28px 16px', border: '1px dashed #e2e8f0', borderRadius: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>No Data Available</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>{data.bullets?.[0] || 'No risks found for selected range.'}</div>
      </div>
    );
  }

  const arrow = (d: string | null) =>
    d === 'up'   ? <span style={{ color: '#ef4444', fontSize: 10 }}>▲</span>
    : d === 'down' ? <span style={{ color: '#10b981', fontSize: 10 }}>▼</span>
    : null;

  const postureColor = data.posture.trend === 'Improving' ? '#10b981'
                     : data.posture.trend === 'Worsening' ? '#ef4444'
                     : '#f59e0b';

  const bulletsFromAI = ai ? ai.split('\n').filter(Boolean) : null;
  const bullets = bulletsFromAI ?? (data.bullets || []);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
        {(data.kpis || []).map((k, i) => (
          <div key={i} style={{ padding: '10px 12px', borderLeft: `3px solid ${k.color}`, background: '#fbfbfb', borderRadius: '0 6px 6px 0' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>
              {k.value}{k.unit} {arrow(k.direction)}
            </div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{k.label}</div>
            {k.prev != null && <div style={{ fontSize: 10, color: '#94a3b8' }}>prev: {k.prev}</div>}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
        {[
          { label: 'Status',     value: data.posture.status,     color: '#1F2854' },
          { label: 'Trend',      value: data.posture.trend,      color: postureColor },
          { label: 'Confidence', value: data.posture.confidence,  color: '#1F2854' },
        ].map((p) => (
          <div key={p.label} style={{ textAlign: 'center', padding: 10, background: '#f8faff', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{p.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: p.color }}>{p.value}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#1F2854', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
        {data.heading_text || 'What Leadership Needs To Know'}
      </div>
      {!ai && bullets.map((b, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
          <span style={{ color: '#01b88e', fontWeight: 700, flexShrink: 0 }}>●</span>
          <span style={{ fontSize: 12, color: '#334155' }}>{b}</span>
        </div>
      ))}
      {ai && <NarrativeTA blockKey="executive-dashboard" value={ai} onEdit={onEdit} />}
    </>
  );
}

function KeyRiskMovementsBlock({ data }: { data: KeyRiskMovementsData }) {
  return (
    <p style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>{data.narrative}</p>
  );
}



// ── Public component ───────────────────────────────────────────────────────────

interface Props {
  blockKey:  BlockKey;
  blockData: BlockDataMap;
  aiData:    Record<string, string>;
  onEdit:    (key: string, value: string) => void;
}

export default function ReportPreview({ blockKey, blockData, aiData, onEdit }: Props) {
  const data = blockData[blockKey];
  const ai   = aiData[blockKey];

  if (!data) {
    return <p style={{ fontSize: 12, color: '#94a3b8' }}>Click Preview &amp; Edit to load data.</p>;
  }

  switch (blockKey) {
    case 'exposure-index':      return <ExposureIndex       data={data as ExposureIndexData}       onEdit={onEdit} />;
    case 'risk-snapshot':       return <RiskSnapshot        data={data as RiskSnapshotData}        onEdit={onEdit} />;
    case 'key-risk-changes':    return <KeyRiskChanges      data={data as KeyRiskChangesData}      onEdit={onEdit} />;
    case 'incident-stability':  return <IncidentStability   data={data as IncidentStabilityData}   onEdit={onEdit} />;
    case 'ai-exec-summary':     return <AIExecSummary       data={data as AIExecSummaryData}       ai={ai} onEdit={onEdit} />;
    case 'executive-commentary':return <ExecutiveCommentary data={data as ExecutiveCommentaryData} ai={ai} onEdit={onEdit} />;
    case 'exposure-trend':      return <ExposureTrend       data={data as TrendData}               onEdit={onEdit} />;
    case 'residual-risk-trend': return <ResidualRiskTrend   data={data as TrendData}               onEdit={onEdit} />;
    case 'incident-trend':      return <IncidentTrend       data={data as TrendData}               onEdit={onEdit} />;
    case 'risk-distribution':   return <RiskDistribution    data={data as RiskDistributionData}    onEdit={onEdit} />;
    case 'top-risks':           return <TopRisksTable       data={data as TopRisksData}            ai={ai} blockKey="top-risks"          onEdit={onEdit} />;
    case 'top-emerging-risks':  return <TopRisksTable       data={data as TopRisksData}            ai={ai} blockKey="top-emerging-risks"  onEdit={onEdit} />;
    case 'major-incidents':     return <MajorIncidentsTable data={data as MajorIncidentsData}      ai={ai} onEdit={onEdit} />;
    case 'findings':            return <FindingsBlock       data={data as FindingsData}            />;
    case 'recommendations':     return <RecommendationsBlock data={data as RecommendationsData}    ai={ai} onEdit={onEdit} />;
    case 'conclusion':          return <ConclusionBlock     data={data as ConclusionData}          onEdit={onEdit} />;
    case 'risk-ownership':      return <RiskOwnershipBlock  data={data as RiskOwnershipData}       onEdit={onEdit} />;
    case 'incident-analytics':  return <IncidentAnalyticsBlock data={data as IncidentAnalyticsData} onEdit={onEdit} />;
    case 'executive-dashboard': return <ExecutiveDashboardBlock data={data as ExecutiveDashboardData} ai={ai} onEdit={onEdit} />;
    case 'key-risk-movements':  return <KeyRiskMovementsBlock   data={data as KeyRiskMovementsData} />;
    default:                    return <p style={{ fontSize: 12, color: '#94a3b8' }}>Unknown block.</p>;
  }
}