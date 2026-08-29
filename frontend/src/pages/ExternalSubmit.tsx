// src/pages/ExternalSubmit.tsx

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

interface TokenInfo { label: string; department: string; }
interface SubmitResult { reference: string; message: string; }

function CheckIcon() {
  return (
    <svg className="sf-step-ico" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="#01b88e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

export default function ExternalSubmit() {
  const { token } = useParams<{ token: string }>();
  const loadedAt  = useRef<number>(0);

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [invalid,   setInvalid]   = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [result,    setResult]    = useState<SubmitResult | null>(null);

  // Section 1
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');

  // Section 2
  const [subType, setSubType] = useState<'risk' | 'incident'>('risk');

  // Section 3
  const [description, setDescription] = useState('');
  const [cause,       setCause]       = useState('');
  const [affects,     setAffects]     = useState('');
  const [category,    setCategory]    = useState('');

  // Section 4
  const [controls, setControls] = useState('');
  const [action,   setAction]   = useState('');

  // Section 5
  const [urgency, setUrgency] = useState<'now' | 'soon' | 'no_rush'>('soon');

  const [submitting, setSubmitting] = useState(false);
  const [errMsg,     setErrMsg]     = useState('');

  useEffect(() => {
    loadedAt.current = Date.now();
    fetch(`${API}/api/v1/submissions/form/${encodeURIComponent(token ?? '__invalid__')}`)
      .then(r => r.json())
      .then(r => {
        if (r.error || !r.data) setInvalid(true);
        else setTokenInfo(r.data);
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit() {
    setErrMsg('');
    if (!name.trim())                   { setErrMsg('Your name is required.'); return; }
    if (!email.trim())                  { setErrMsg('Your email is required.'); return; }
    if (description.trim().length < 20) { setErrMsg('Please describe the risk in a little more detail (at least 20 characters).'); return; }

    if (Date.now() - loadedAt.current < 5000) {
      setResult({ reference: '', message: 'Received.' });
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        submitter_name:     name.trim(),
        submitter_email:    email.trim(),
        submission_type:    subType,
        description:        description.trim(),
        cause:              cause.trim()    || null,
        affects:            affects.trim()  || null,
        suggested_category: category        || null,
        existing_controls:  controls.trim() || null,
        suggested_action:   action.trim()   || null,
        submitter_urgency:  urgency,
        website:            '',
      };
      const res  = await fetch(`${API}/api/v1/submissions/form/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 429) {
        setErrMsg('Too many submissions from this device. Please try again later.');
      } else if (!res.ok || data.error) {
        setErrMsg(data.error ?? 'Submission failed. Please try again.');
      } else {
        setResult(data.data);
      }
    } catch {
      setErrMsg('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="sf-page">
      <div className="sf-wrap">
        <div className="sf-head" style={{ borderRadius: 14 }}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div className="sr-spinner" style={{ margin: '0 auto' }} />
          </div>
        </div>
      </div>
    </div>
  );

  if (invalid) return (
    <div className="sf-page">
      <div className="sf-wrap">
        <Brandbar tokenInfo={null} />
        <div className="sf-head" style={{ borderRadius: 14 }}>
          <div className="sf-invalid">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#dde3f0"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <h2 style={{ marginTop: 16 }}>This link is not available</h2>
            <p>The submission link you followed may have expired, been revoked, or may not exist.
              Please contact the team that shared this link with you.</p>
          </div>
        </div>
      </div>
    </div>
  );

  if (result) return (
    <div className="sf-page">
      <div className="sf-wrap">
        <Brandbar tokenInfo={tokenInfo} />
        <div className="sf-head" style={{ borderRadius: 14 }}>
          <div className="sf-success">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#01b88e"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}>
              <circle cx="12" cy="12" r="10"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
            <h2>Submission received</h2>
            {result.reference && <span className="sf-ref">{result.reference}</span>}
            <p style={{ marginTop: 10 }}>
              You will get an acknowledgement email shortly. The risk team will review
              your submission and send you an outcome within five working days.
            </p>
          </div>
        </div>
        <WhatHappensNext />
        <p className="sf-pagefoot">
          Powered by SmartRisk Pulse · This link is unique to {tokenInfo?.department} and can be revoked at any time.
        </p>
      </div>
    </div>
  );

  return (
    <div className="sf-page">
      <div className="sf-wrap">
        <Brandbar tokenInfo={tokenInfo} />

        <div className="sf-head">
          <h1>Submit a risk</h1>
          <p>
            If you have spotted something that could go wrong in your area, tell us about it here.
            You do not need to score it or know how it will be fixed — the risk team handles that.
          </p>
          <div className="sf-ctx">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
            </svg>
            Submitting on behalf of <strong style={{ margin: '0 3px' }}>{tokenInfo?.department}</strong>
            {tokenInfo?.label && <> · {tokenInfo.label}</>}
          </div>
        </div>

        {/* Honeypot */}
        <input type="text" name="website" autoComplete="off"
          style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />

        <div className="sf-form">

          {/* Section 1 — About you */}
          <div className="sf-sect">
            <div className="sf-sect-head">
              <div className="sf-sect-num">1</div>
              <h3>About you</h3>
            </div>
            <div className="sf-grid2">
              <div className="sf-field">
                <label className="sf-label">Your name <span className="sf-req">*</span></label>
                <input className="sf-input" type="text" placeholder="Full name"
                  value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="sf-field">
                <label className="sf-label">Work email <span className="sf-req">*</span></label>
                <input className="sf-input" type="email" placeholder="name@company.com"
                  value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="sf-field">
              <label className="sf-label">Department</label>
              <div className="sf-dept-static">{tokenInfo?.department}</div>
            </div>
          </div>

          {/* Section 2 — What are you reporting */}
          <div className="sf-sect">
            <div className="sf-sect-head">
              <div className="sf-sect-num">2</div>
              <h3>What are you reporting?</h3>
            </div>
            <div className="sf-choices">
              <button
                type="button"
                className={`sf-choice${subType === 'risk' ? ' on' : ''}`}
                onClick={() => setSubType('risk')}
              >
                <p className="sf-choice-title">Something that could happen</p>
                <span className="sf-choice-sub">It has not happened yet, but you think it might</span>
              </button>
              <button
                type="button"
                className={`sf-choice${subType === 'incident' ? ' on' : ''}`}
                onClick={() => setSubType('incident')}
              >
                <p className="sf-choice-title">Something that already happened</p>
                <span className="sf-choice-sub">An error, loss, outage, or near miss</span>
              </button>
            </div>
            {subType === 'incident' && (
              <div className="sf-callout sf-callout-amber">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <div>
                  <strong>That is an incident, not a risk.</strong> Incidents are logged separately
                  so they can be investigated and closed. Your answers will be carried across —
                  nothing is lost.
                </div>
              </div>
            )}
          </div>

          {/* Section 3 — Tell us about it */}
          <div className="sf-sect">
            <div className="sf-sect-head">
              <div className="sf-sect-num">3</div>
              <h3>Tell us about it</h3>
            </div>
            <div className="sf-field">
              <label className="sf-label">What is the risk? <span className="sf-req">*</span></label>
              <p className="sf-help">Plain language is fine. Write it the way you would explain it to a colleague.</p>
              <textarea className="sf-input" rows={3}
                placeholder="e.g. We reconcile the account manually each week, so a shortfall mid-week would not be spotted until Friday."
                value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div className="sf-field">
              <label className="sf-label">What is causing it? <span className="sf-opt">optional</span></label>
              <p className="sf-help">Leave blank if you are not sure.</p>
              <textarea className="sf-input" rows={2}
                placeholder="e.g. No automated feed from the system into the ledger."
                value={cause} onChange={e => setCause(e.target.value)} />
            </div>
            <div className="sf-field">
              <label className="sf-label">What could it affect? <span className="sf-opt">optional</span></label>
              <input className="sf-input" type="text"
                placeholder="e.g. Customer payouts, regulatory reporting, our licence"
                value={affects} onChange={e => setAffects(e.target.value)} />
            </div>
            <div className="sf-field">
              <label className="sf-label">Which area does this fall under? <span className="sf-opt">optional</span></label>
              <p className="sf-help">A rough guess is fine — the risk team confirms this at review.</p>
              <select className="sf-input" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">— Not sure, let the risk team decide —</option>
                <option value="Operational">Operational</option>
                <option value="Technology">Cybersecurity / Technology</option>
                <option value="Compliance">Legal / Compliance</option>
                <option value="Financial">Financial</option>
                <option value="Reputational">Reputational</option>
                <option value="Strategic">Strategic</option>
                <option value="People">People</option>
              </select>
            </div>
          </div>

          {/* Section 4 — What is already being done */}
          <div className="sf-sect">
            <div className="sf-sect-head">
              <div className="sf-sect-num">4</div>
              <h3>What is already being done</h3>
            </div>
            <div className="sf-field">
              <label className="sf-label">Is anything in place to manage this today? <span className="sf-opt">optional</span></label>
              <p className="sf-help">Describe what actually happens, not what the procedure says should happen.</p>
              <textarea className="sf-input" rows={2}
                placeholder="e.g. The team lead checks the balance each morning, but there is no record of it."
                value={controls} onChange={e => setControls(e.target.value)} />
            </div>
            <div className="sf-field">
              <label className="sf-label">What do you think should be done? <span className="sf-opt">optional</span></label>
              <input className="sf-input" type="text"
                placeholder="e.g. Daily automated reconciliation with an exception report"
                value={action} onChange={e => setAction(e.target.value)} />
            </div>
          </div>

          {/* Section 5 — Urgency */}
          <div className="sf-sect">
            <div className="sf-sect-head">
              <div className="sf-sect-num">5</div>
              <h3>How pressing does this feel?</h3>
              <span className="sf-sect-hint">Your view, not a score</span>
            </div>
            <div className="sf-urg">
              {(
                [
                  { key: 'now',     label: 'Needs attention now'     },
                  { key: 'soon',    label: 'Should be looked at soon' },
                  { key: 'no_rush', label: 'No particular rush'       },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={`sf-choice${urgency === key ? ' on' : ''}`}
                  onClick={() => setUrgency(key)}
                >
                  <p className="sf-choice-title">{label}</p>
                </button>
              ))}
            </div>
            <div className="sf-callout sf-callout-grey">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div>
                This tells the risk team how to prioritise their review. It is <strong>not</strong> the
                risk rating — likelihood and impact are scored consistently across the whole
                organisation by the risk team.
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sf-foot">
            {errMsg && <p className="sf-err">{errMsg}</p>}
            <button className="sf-submit" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit risk'}
            </button>
            <p className="sf-privacy">
              Your name and department are recorded with this submission and visible to the
              risk team. It is not anonymous, and is not shared with your line manager as a matter of course.
            </p>
          </div>
        </div>

        <WhatHappensNext />

        <p className="sf-pagefoot">
          Powered by SmartRisk Pulse · This link is unique to {tokenInfo?.department} and can be revoked at any time.
        </p>
      </div>
    </div>
  );
}

function Brandbar({ tokenInfo }: { tokenInfo: TokenInfo | null }) {
  return (
    <div className="sf-brandbar">
      <div className="sf-mark">
        <ShieldIcon />
      </div>
      <div>
        <strong className="sf-brand-name">{tokenInfo?.label ?? 'SmartRisk Pulse'}</strong>
        <span className="sf-brand-sub">Risk &amp; Compliance</span>
      </div>
    </div>
  );
}

function WhatHappensNext() {
  return (
    <div className="sf-next">
      <p className="sf-next-head">What happens next</p>
      <div className="sf-step">
        <CheckIcon />
        <div>You get an <strong>acknowledgement email</strong> with a reference number, straight away.</div>
      </div>
      <div className="sf-step">
        <CheckIcon />
        <div>
          The risk team <strong>reviews and scores</strong> it — usually within five working days.
          It sits in a pending queue until then, and does not appear on the register.
        </div>
      </div>
      <div className="sf-step">
        <CheckIcon />
        <div>
          You are told the outcome: <strong>accepted onto the register, merged</strong> with an
          existing risk, or <strong>closed</strong> with a reason.
        </div>
      </div>
    </div>
  );
}