// src/pages/Frameworks.tsx

import { useState } from "react";

// ── Module-level data ──────────────────────────────────────────────────

const SUMMARY = [
  { label: "Framework Scope",    value: "Enterprise Risk Management" },
  { label: "Assessment Model",   value: "Likelihood × Impact"        },
  { label: "Monitoring",         value: "Residual Exposure Tracking"  },
  { label: "Intelligence Layer", value: "AI-Assisted Insights"        },
];

const FLOW_STEPS = [
  "Identify Risk", "Assess Likelihood", "Assess Impact",
  "Evaluate Controls", "Residual Exposure", "Monitor & Report",
];

const RISK_TAGS = [
  "Governance", "Risk Monitoring", "Executive Reporting",
  "Traceability", "AI Insights", "Accountability",
];

const LEVELS = [
  { cls: "fw-lvl-low", label: "Low",      range: "1 – 4",   note: "Routine monitoring"      },
  { cls: "fw-lvl-mod", label: "Moderate", range: "5 – 9",   note: "Management oversight"    },
  { cls: "fw-lvl-hi",  label: "High",     range: "10 – 16", note: "Enhanced mitigation"     },
  { cls: "fw-lvl-vhi", label: "Critical", range: "17 – 25", note: "Immediate escalation"    },
];

const SCORING_ROWS = [
  { range: "1 – 4",   level: "Low",      expect: "Routine monitoring"                 },
  { range: "5 – 9",   level: "Moderate", expect: "Management oversight required"       },
  { range: "10 – 16", level: "High",     expect: "Enhanced mitigation monitoring"      },
  { range: "17 – 25", level: "Critical", expect: "Immediate escalation and action"     },
];

const INC_TYPES = [
  { title: "Financial",       desc: "Monetary loss, budget overrun, or revenue impact events"                  },
  { title: "Operational",     desc: "Process failures, service disruptions, or system outages"                 },
  { title: "Reputational",    desc: "Brand, stakeholder trust, or regulatory perception events"               },
  { title: "Critical / Safety", desc: "Life safety, regulatory breach, or business continuity threats"        },
];

const ISO_CARDS = [
  { cls: "fw-iso-31000", title: "ISO 31000", desc: "International standard for risk management principles and guidelines" },
  { cls: "fw-iso-coso",  title: "COSO ERM",  desc: "Enterprise Risk Management integrated framework"                     },
  { cls: "fw-iso-22301", title: "ISO 22301", desc: "Business continuity management systems standard"                     },
  { cls: "fw-iso-27001", title: "ISO 27001", desc: "Information security, cybersecurity and privacy protection"          },
];

const DASH_CARDS = [
  { label: "Risk Health",      desc: "Consolidated exposure posture indicator based on active risks and control conditions."      },
  { label: "Risk Pressure",    desc: "Visibility into elevated exposure and high-severity risk concentration."                    },
  { label: "Residual Trends",  desc: "Monitoring of exposure movement — improving, deteriorating, or volatile."                  },
  { label: "Control Strength", desc: "Relative indication of mitigation effectiveness and control maturity."                     },
];

const FWORK_CARDS = [
  { title: "Risk Health Indicator", body: "Consolidated view of organizational exposure posture using active risks, severity distribution, and monitoring indicators."             },
  { title: "Risk Distribution",     body: "Visualizes concentration of exposures across projects, business units, and enterprise classifications."                                 },
  { title: "Residual Risk Trends",  body: "Supports monitoring of changing exposure conditions over time, including improving or deteriorating trends."                           },
  { title: "Top Residual Drivers",  body: "Highlights the most significant remaining exposures requiring management attention and governance oversight."                           },
  { title: "Executive Narratives",  body: "AI-assisted summaries providing management-ready narratives on emerging risks and elevated exposures."                                 },
  { title: "Audit Log & Tracking",  body: "Maintains audit logs for governance oversight, accountability, and user activity traceability."                                        },
];

const AI_TAGS = [
  "Executive Narratives", "Trend Detection",  "Exposure Insights",
  "Human Reviewed",       "Governance Aligned", "Audit Traceable",
];

const SECTIONS = [
  "Framework Purpose",
  "Risk Assessment Methodology",
  "Risk Scoring Model",
  "Risk Register & Incident Standards",
  "Governance & Framework Alignment",
  "Dashboard Intelligence & Metrics",
  "AI-Assisted Risk Intelligence",
];

// ── Chevron SVG ────────────────────────────────────────────────────────
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`fw-chevron${open ? " open" : ""}`}
      width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.25"
      strokeLinecap="round" strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Main page ──────────────────────────────────────────────────────────
export default function Frameworks() {
  const [openSections, setOpenSections] = useState<Set<number>>(new Set([0]));
  const [openFwork, setOpenFwork] = useState<Set<number>>(new Set());

  function toggleSection(i: number) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(i)) { next.delete(i); } else { next.add(i); }
      return next;
    });
  }

  function toggleFwork(i: number) {
    setOpenFwork((prev) => {
      const next = new Set(prev);
      if (next.has(i)) { next.delete(i); } else { next.add(i); }
      return next;
    });
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Frameworks</h1>
        <div className="crumbs">Risk Methodology</div>
      </div>

      <div className="fw-wrap" style={{ marginTop: 20 }}>

        {/* Intro */}
        <div className="fw-intro">
          <div className="fw-badge">SmartRisk Framework</div>
          <p>
            SmartRisk provides a structured methodology for identifying, assessing, monitoring, and reporting
            organizational risks using governance-aligned principles, dashboard intelligence, and AI-assisted insights.
          </p>
          <div className="fw-summary-grid">
            {SUMMARY.map((s) => (
              <div key={s.label} className="fw-summary-card">
                <small>{s.label}</small>
                <strong>{s.value}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* Section 01 — Framework Purpose */}
        <div className="fw-section">
          <div className="fw-section-header" onClick={() => toggleSection(0)}>
            <div className="fw-section-left">
              <div className="fw-section-num">01</div>
              <h2>{SECTIONS[0]}</h2>
            </div>
            <Chevron open={openSections.has(0)} />
          </div>
          {openSections.has(0) && (
            <div className="fw-section-inner">
              <div className="fw-cols">
                <p className="fw-desc">
                  The SmartRisk Framework establishes a consistent methodology for identifying, assessing, monitoring,
                  and reporting organizational risks across operational and strategic activities. It supports governance
                  oversight, executive reporting, and risk-informed decision-making.
                </p>
                <div className="fw-tags">
                  {RISK_TAGS.map((t) => <div key={t} className="fw-tag">{t}</div>)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 02 — Risk Assessment Methodology */}
        <div className="fw-section">
          <div className="fw-section-header" onClick={() => toggleSection(1)}>
            <div className="fw-section-left">
              <div className="fw-section-num">02</div>
              <h2>{SECTIONS[1]}</h2>
            </div>
            <Chevron open={openSections.has(1)} />
          </div>
          {openSections.has(1) && (
            <div className="fw-section-inner">
              <div className="fw-cols">
                <div>
                  <p className="fw-desc">
                    Risks are evaluated using a structured methodology that considers likelihood, business impact,
                    existing controls, and residual exposure conditions.
                  </p>
                  <div className="fw-formula-box">
                    <strong>Inherent Risk</strong> = Likelihood × Impact<br />
                    <strong>Residual Risk</strong> = Inherent Risk × (1 − Control Effectiveness)
                  </div>
                </div>
                <div className="fw-flow">
                  {FLOW_STEPS.map((s) => <div key={s} className="fw-flow-step">{s}</div>)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 03 — Risk Scoring Model */}
        <div className="fw-section">
          <div className="fw-section-header" onClick={() => toggleSection(2)}>
            <div className="fw-section-left">
              <div className="fw-section-num">03</div>
              <h2>{SECTIONS[2]}</h2>
            </div>
            <Chevron open={openSections.has(2)} />
          </div>
          {openSections.has(2) && (
            <div className="fw-section-inner">
              <div className="fw-cols">
                <div>
                  <p className="fw-desc">
                    Risk severity is evaluated using a standardized likelihood and impact matrix to support consistent
                    organizational assessments.
                  </p>
                  <div className="fw-level-grid" style={{ gridTemplateColumns: "repeat(2,1fr)", marginTop: 14 }}>
                    {LEVELS.map((l) => (
                      <div key={l.label} className={`fw-lvl-card ${l.cls}`}>
                        <small>{l.label}</small>
                        <strong>{l.range}</strong>
                        <span>{l.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="fw-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Score Range</th>
                        <th>Classification</th>
                        <th>Management Expectation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SCORING_ROWS.map((r) => (
                        <tr key={r.range}>
                          <td>{r.range}</td>
                          <td>{r.level}</td>
                          <td>{r.expect}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 04 — Risk Register & Incident Standards */}
        <div className="fw-section">
          <div className="fw-section-header" onClick={() => toggleSection(3)}>
            <div className="fw-section-left">
              <div className="fw-section-num">04</div>
              <h2>{SECTIONS[3]}</h2>
            </div>
            <Chevron open={openSections.has(3)} />
          </div>
          {openSections.has(3) && (
            <div className="fw-section-inner">
              <div className="fw-cols">
                <p className="fw-desc">
                  Risk records are maintained using standardized fields to support consistency, reporting integrity,
                  governance oversight, and audit traceability. Incidents are categorised by severity and escalated
                  per ISO 22301.
                </p>
                <div>
                  <div className="fw-inc-grid">
                    {INC_TYPES.map((t) => (
                      <div key={t.title} className="fw-inc-card">
                        <h4>{t.title}</h4>
                        <p>{t.desc}</p>
                      </div>
                    ))}
                  </div>
                  <div className="fw-escalation">
                    <small>ISO 22301 Escalation Path</small>
                    <div className="fw-esc-flow">
                      {["Report", "Assess", "Contain", "Recover"].map((s) => (
                        <div key={s} className="fw-esc-step">{s}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 05 — Governance & Framework Alignment */}
        <div className="fw-section">
          <div className="fw-section-header" onClick={() => toggleSection(4)}>
            <div className="fw-section-left">
              <div className="fw-section-num">05</div>
              <h2>{SECTIONS[4]}</h2>
            </div>
            <Chevron open={openSections.has(4)} />
          </div>
          {openSections.has(4) && (
            <div className="fw-section-inner">
              <p className="fw-desc" style={{ marginBottom: 14 }}>
                Risk owners maintain accountability for exposure accuracy, mitigation activities, periodic reviews,
                and escalation processes. SmartRisk methodology aligns with industry-standard frameworks configurable
                in <strong>Settings → Workspace</strong>.
              </p>
              <div className="fw-iso-grid">
                {ISO_CARDS.map((c) => (
                  <div key={c.title} className={`fw-iso-card ${c.cls}`}>
                    <h4>{c.title}</h4>
                    <p>{c.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Section 06 — Dashboard Intelligence & Metrics */}
        <div className="fw-section">
          <div className="fw-section-header" onClick={() => toggleSection(5)}>
            <div className="fw-section-left">
              <div className="fw-section-num">06</div>
              <h2>{SECTIONS[5]}</h2>
            </div>
            <Chevron open={openSections.has(5)} />
          </div>
          {openSections.has(5) && (
            <div className="fw-section-inner">
              <div className="fw-cols">
                <div>
                  <p className="fw-desc">
                    SmartRisk dashboards provide consolidated visibility into organizational exposure conditions,
                    residual trends, control effectiveness, and executive monitoring indicators.
                  </p>
                  <div className="fw-dashboard-box" style={{ marginTop: 14 }}>
                    <div className="fw-dashboard-head">Dashboard Intelligence Overview</div>
                    <div className="fw-dashboard-grid">
                      {DASH_CARDS.map((c) => (
                        <div key={c.label} className="fw-dashboard-card">
                          <small>{c.label}</small>
                          <p>{c.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="fw-fwork-grid">
                  {FWORK_CARDS.map((c, i) => (
                    <div key={c.title} className="fw-fwork-card">
                      <div className="fw-fwork-head" onClick={() => toggleFwork(i)}>
                        <h3>{c.title}</h3>
                        <span>{openFwork.has(i) ? "−" : "+"}</span>
                      </div>
                      {openFwork.has(i) && (
                        <div className="fw-fwork-body">{c.body}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 07 — AI-Assisted Risk Intelligence */}
        <div className="fw-section">
          <div className="fw-section-header" onClick={() => toggleSection(6)}>
            <div className="fw-section-left">
              <div className="fw-section-num">07</div>
              <h2>{SECTIONS[6]}</h2>
            </div>
            <Chevron open={openSections.has(6)} />
          </div>
          {openSections.has(6) && (
            <div className="fw-section-inner">
              <div className="fw-cols">
                <p className="fw-desc">
                  SmartRisk incorporates AI-assisted analysis to enhance risk visibility, reporting efficiency, and
                  identification of emerging exposure patterns. AI insights support management review and do not
                  replace professional judgment or governance oversight.
                </p>
                <div className="fw-ai-tags">
                  {AI_TAGS.map((t) => <div key={t} className="fw-tag">{t}</div>)}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="fw-footer">SmartRisk Framework &bull; Internal Governance Methodology &bull; 2026</div>

      </div>
    </div>
  );
}