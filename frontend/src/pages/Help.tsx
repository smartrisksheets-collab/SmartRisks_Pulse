// src/pages/Help.tsx

import { useState } from "react";
import { useNavigate } from "react-router-dom";

// ── Module-level FAQ data ──────────────────────────────────────────────

interface FAQ {
  q: string;
  adminOnly?: boolean;
  body: React.ReactNode;
}

const ChevronDown = () => (
  <svg className="cv" width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const Dot = ({ color }: { color: string }) => (
  <span className="hlp-dot" style={{ background: color }} />
);

const FAQS: FAQ[] = [
  {
    q: "How do I add a new risk?",
    body: (
      <>
        Go to <b>Risk Register</b> and choose <b>Add risk</b>. Give it a description, category and owner,
        then rate <b>Likelihood</b> and <b>Impact</b> from 1–5.
        <ol>
          <li><b>Severity</b> is calculated for you: Likelihood × Impact.</li>
          <li>Add your <b>control effectiveness</b> rating, and Pulse calculates <b>residual exposure</b> — the risk you still carry after controls.</li>
          <li>The risk is banded automatically (Low, Medium, High, Critical) and appears on your dashboard immediately.</li>
        </ol>
      </>
    ),
  },
  {
    q: "How do I import my existing risk register?",
    body: (
      <>
        You do not need to re-key anything — bring the register you already maintain.
        <ol>
          <li>Export your current register as a spreadsheet.</li>
          <li>In <b>Risk Register</b>, choose <b>Import</b> and upload the file.</li>
          <li>Fields are auto-mapped from the standard template. Review the mapping and correct anything the importer guessed wrong.</li>
          <li>Confirm — the engine scores residual exposure and control strength in minutes.</li>
        </ol>
        An incomplete register still imports. Pulse flags what is missing, which is often the fastest way to find out how complete your register really is.
      </>
    ),
  },
  {
    q: "How do I edit or update a risk?",
    body: (
      <>
        Open the risk from the <b>Risk Register</b> and edit it in place. Re-scoring likelihood, impact or control
        effectiveness recalculates residual exposure straight away — and if the risk crosses a band (Medium to High,
        for example), it is logged to the operational feed and picked up in the next risk brief.<br /><br />
        Every change is recorded in the <b>audit log</b>: who changed what, and when.
      </>
    ),
  },
  {
    q: "How do I generate AI Insights?",
    body: (
      <>
        AI Insights are generated from your live register — so the more current your register, the more useful the
        insight. Open the <b>Dashboard</b> and choose <b>View insights</b> to generate a plain-language read of your
        current posture.<br /><br />
        <b>AI-assisted, not AI-dependent.</b> The scoring methodology is the product; the AI drafts the language.
        Insights support decision-making and should be validated alongside your professional judgement.
      </>
    ),
  },
  {
    q: "What do Confidence and Status mean?",
    body: (
      <>
        These two indicators look similar but do completely different jobs — and they are <b>independent of each other</b>.<br /><br />
        <b>Confidence</b> controls <b>how the AI writes its insight text</b> for that risk.
        <table className="hlp-tbl">
          <tbody>
            <tr><th>Level</th><th>What it means</th></tr>
            <tr><td><Dot color="#9aa6bd" /><b>Low</b></td><td>AI writes cautiously, states assumptions, flags missing information</td></tr>
            <tr><td><Dot color="#e8912d" /><b>Medium</b></td><td>AI writes in a balanced, practical tone with minimal caveats</td></tr>
            <tr><td><Dot color="#01b88e" /><b>High</b></td><td>AI is decisive, gives clear actions, minimises hedging</td></tr>
          </tbody>
        </table>
        <b>Status</b> is <b>calculated automatically</b> from the risk's own data.
        <table className="hlp-tbl">
          <tbody>
            <tr><th>Status</th><th>Trigger condition</th></tr>
            <tr><td><Dot color="#ef4444" /><b>Escalate</b></td><td>Risk level is Critical, <b>or</b> residual score is 17 or above</td></tr>
            <tr><td><Dot color="#f97316" /><b>Monitor</b></td><td>Risk level is High, <b>or</b> residual score is 10 or above</td></tr>
            <tr><td><Dot color="#eab308" /><b>Review</b></td><td>Risk level is Medium</td></tr>
            <tr><td><Dot color="#22c55e" /><b>Stable</b></td><td>Low level, residual below 10</td></tr>
          </tbody>
        </table>
        <b>In short:</b> Confidence reflects how the AI was <em>instructed to respond</em>. Status reflects the <em>actual severity</em> of the risk in your register.
      </>
    ),
  },
  {
    q: "How do I print or export a report?",
    body: (
      <>
        Go to <b>Report Builder</b>, choose the components you want (health score, residual trend, distribution,
        top drivers, register extract, AI insight), and export.<br /><br />
        Reports are generated from the <b>live register</b>, so the pack reflects where you stand right now.
      </>
    ),
  },
  {
    q: "What is the incident workflow?",
    body: (
      <>
        Log the incident, link it to the risk on your register that it relates to, and set an owner and a remediation
        deadline. Linking matters: an unlinked incident is an isolated event, but a linked one tells you that a risk
        you already knew about is now materialising — and whether your controls held.<br /><br />
        Open incidents appear in the <b>operational feed</b> with their SLA clock running, and in the daily <b>risk brief</b>.
      </>
    ),
  },
  {
    q: "What is the difference between severity and residual exposure?",
    body: (
      <>
        <b>Severity</b> (Likelihood × Impact) tells you how bad a risk could be if nothing were done about it.<br /><br />
        <b>Residual exposure</b> (Severity minus Control Effectiveness) tells you how bad it still is <em>after</em> your
        controls. That is the risk you actually carry, and it is what Pulse scores, trends and reports.<br /><br />
        If a risk's residual is close to its severity, that usually means the controls in place are adding little measurable value.
      </>
    ),
  },
  {
    q: "How do I invite my team?",
    body: (
      <>
        Go to <b>Users</b> and invite colleagues by email. Access is role-based, so people see only what they are
        authorised to see.<br /><br />
        <b>Invite your risk owners, not just your risk team.</b> A register only stays live if the people who own the
        risks keep them updated.
      </>
    ),
  },
  {
    q: "How do I set a user's role and permissions?",
    adminOnly: true,
    body: (
      <>
        <b>Only an Admin can assign roles.</b> Go to <b>Users</b>, invite by email, and pick a role.
        <table className="hlp-tbl hlp-tbl-perm">
          <tbody>
            <tr>
              <th>Permission</th>
              <th>Analyst<br /><span className="hlp-th-s">Limited</span></th>
              <th>Manager<br /><span className="hlp-th-s">Mid-level</span></th>
              <th>Admin<br /><span className="hlp-th-s">Full</span></th>
            </tr>
            <tr><td>Manage Risks</td>      <td className="no">✕</td><td className="yes">✓</td><td className="yes">✓</td></tr>
            <tr><td>Manage Incidents</td>  <td className="yes">✓</td><td className="yes">✓</td><td className="yes">✓</td></tr>
            <tr><td>Review & Resolve</td>  <td className="no">✕</td><td className="yes">✓</td><td className="yes">✓</td></tr>
            <tr><td>Generate AI</td>       <td className="no">✕</td><td className="yes">✓</td><td className="yes">✓</td></tr>
            <tr><td>Print Reports</td>     <td className="no">✕</td><td className="yes">✓</td><td className="yes">✓</td></tr>
            <tr><td>Manage Users</td>      <td className="no">✕</td><td className="no">✕</td><td className="yes">✓</td></tr>
            <tr><td>Manage Settings</td>   <td className="no">✕</td><td className="no">✕</td><td className="yes">✓</td></tr>
          </tbody>
        </table>
        <b>Manager</b> is the right fit for most risk owners. <b>Analyst</b> is incidents only. Reserve <b>Admin</b> for
        the few who need to change how the workspace is configured.
      </>
    ),
  },
  {
    q: "How do I set up my daily Risk Brief?",
    body: (
      <>
        The Risk Brief is a daily email digest of what changed in your register overnight. Configure it in{" "}
        <b>Settings &gt; Risk Brief</b>.<br /><br />
        <b>The basics</b>
        <ol>
          <li>Set <b>Brief Status</b> to <b>On</b>.</li>
          <li>Choose a <b>Send Time</b> — pick a slot before your first meeting.</li>
          <li>Add <b>Recipients</b>, comma-separated.</li>
        </ol>
        <b>Cadence</b><br />
        The daily exception feed always runs. Heavier digests layer on based on the date:
        <ul className="hlp-ul">
          <li><b>Weekly Digest</b> — Mondays.</li>
          <li><b>Monthly Posture</b> — 1st business day.</li>
          <li><b>Quarterly Board Summary</b> — the committee-ready view.</li>
        </ul>
      </>
    ),
  },
  {
    q: "Where do I check my license or trial status?",
    body: (
      <>
        Go to <b>Settings &gt; Billing</b>. Your current plan, trial days remaining, and renewal details are shown there.<br /><br />
        Need an invoice for procurement?{" "}
        <a className="lnk" href="mailto:info@smartrisksheets.com">Get in touch</a> and we will issue one.
      </>
    ),
  },
  {
    q: "Why has a risk been flagged as stale?",
    body: (
      <>
        Pulse tracks when each risk was last reviewed. If a risk has gone unreviewed past your configured threshold
        (30, 60 or 90 days), it is flagged as stale and surfaces in the operational feed and the risk brief.<br /><br />
        Adjust the thresholds in <b>Settings &gt; Risk Configuration</b>.
      </>
    ),
  },
];

// ── Main page ──────────────────────────────────────────────────────────
export default function Help() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const term = search.trim().toLowerCase();
  const visible = FAQS.filter((f) =>
    !term || f.q.toLowerCase().includes(term)
  );

  function toggleFaq(i: number) {
    setOpenFaq((prev) => (prev === i ? null : i));
  }

  return (
    <div className="page">
      <div className="hlp">

        <div className="hlp-head">
          <h1 className="hlp-h1">Help</h1>
          <p className="hlp-sub">Quick answers, guides, and support — start here.</p>
        </div>

        {/* Quickstart */}
        <div className="hlp-start">
          <div className="hlp-start-t">New here? Start with these</div>
          <div className="hlp-start-grid">
            <div className="hlp-step" onClick={() => navigate("/risks")}>
              <span className="hlp-step-n">1</span>
              <span>
                <span className="hlp-step-t">Import your register</span>
                <span className="hlp-step-d">Bring the risk register you already keep. No re-keying.</span>
              </span>
            </div>
            <div className="hlp-step" onClick={() => navigate("/dashboard")}>
              <span className="hlp-step-n">2</span>
              <span>
                <span className="hlp-step-t">Read your health score</span>
                <span className="hlp-step-d">See your 0–100 exposure score and what is driving it.</span>
              </span>
            </div>
            <div className="hlp-step" onClick={() => navigate("/users")}>
              <span className="hlp-step-n">3</span>
              <span>
                <span className="hlp-step-t">Invite your risk owners</span>
                <span className="hlp-step-d">A register only stays live if the owners keep it updated.</span>
              </span>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="hlp-card">
          <h2 className="hlp-card-h">Common questions</h2>
          <p className="hlp-card-s">Search, or browse the answers below.</p>

          <div className="hlp-search-wrap">
            <span className="hlp-search-ic">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              className="hlp-search"
              type="text"
              placeholder="Try: add risk, import, AI insights, export report…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOpenFaq(null); }}
              autoComplete="off"
            />
          </div>

          <div className="hlp-faqs">
            {visible.map((f, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={f.q} className={`hlp-faq${isOpen ? " open" : ""}`}>
                  <button className="hlp-q" type="button" onClick={() => toggleFaq(i)}>
                    {f.q}
                    {f.adminOnly && <span className="hlp-badge">Admin only</span>}
                    <ChevronDown />
                  </button>
                  {isOpen && (
                    <div className="hlp-a">
                      <div className="hlp-a-in">{f.body}</div>
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && (
              <div className="hlp-empty show">
                No answers match that search. Try a different term, or{" "}
                <a className="lnk" href="mailto:info@smartrisksheets.com">contact support</a>.
              </div>
            )}
          </div>
        </div>

        {/* Escape hatches */}
        <div className="hlp-out">
          <a className="hlp-out-c" href="https://smartrisksheets.com/docs" target="_blank" rel="noopener noreferrer">
            <span className="hlp-out-ic">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </span>
            <span>
              <span className="hlp-out-t">Read the documentation</span>
              <span className="hlp-out-d">Full guides for the register, scoring methodology, reports and settings.</span>
            </span>
          </a>
          <a className="hlp-out-c solid" href="https://smartrisksheets.com/contact" target="_blank" rel="noopener noreferrer">
            <span className="hlp-out-ic">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </span>
            <span>
              <span className="hlp-out-t">Still stuck? Contact support</span>
              <span className="hlp-out-d">We reply to every message. Usually within one business day.</span>
            </span>
          </a>
        </div>

      </div>
    </div>
  );
}