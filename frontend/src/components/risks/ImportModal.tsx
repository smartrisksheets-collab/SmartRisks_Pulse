// src/components/risks/ImportModal.tsx

import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import type { BulkImportRow, BulkImportResult } from '../../types/risk';
import { useLookups } from '../../hooks/useLookups';
import { useFeedbackStore } from '../../store/feedbackStore';

interface Props {
  open:     boolean;
  onClose:  () => void;
  onImport: (rows: BulkImportRow[]) => Promise<BulkImportResult | null>;
}

interface ImpField { key: string; label: string; required: boolean; }

const IMP_FIELDS: ImpField[] = [
  { key: 'category',              label: 'Category',              required: true  },
  { key: 'description',           label: 'Description',           required: true  },
  { key: 'owner',                 label: 'Owner',                 required: true  },
  { key: 'likelihood',            label: 'Likelihood',            required: true  },
  { key: 'impact_score',          label: 'Impact Score',          required: true  },
  { key: 'treatment',             label: 'Treatment',             required: true  },
  { key: 'primary_impact',        label: 'Primary Impact',        required: false },
  { key: 'logged_at',             label: 'Date Logged',           required: false },
  { key: 'controls',              label: 'Existing Controls',     required: false },
  { key: 'control_effectiveness', label: 'Control Effectiveness', required: false },
  { key: 'mitigation_plan',       label: 'Mitigation Plan',       required: false },
  { key: 'comments',              label: 'Comments',              required: false },
];

const REQUIRED_KEYS = IMP_FIELDS.filter(f => f.required).map(f => f.key);

function normalize(s: string) { return s.toLowerCase().replace(/[^a-z0-9]/g, ''); }

const AUTO_MAP: Record<string, string> = {
  category: 'category', riskcategory: 'category', riskcat: 'category',
  description: 'description', desc: 'description', riskdescription: 'description',
  owner: 'owner', riskowner: 'owner',
  likelihood: 'likelihood',
  impactscore: 'impact_score', impact: 'impact_score',
  treatment: 'treatment',
  primaryimpact: 'primary_impact',
  datelogged: 'logged_at', logged: 'logged_at',
  existingcontrols: 'controls', controls: 'controls',
  controleffectiveness: 'control_effectiveness', controleff: 'control_effectiveness',
  mitigationplan: 'mitigation_plan', plan: 'mitigation_plan',
  comments: 'comments', analystcomments: 'comments',
};

interface PreviewRow extends BulkImportRow { _valid: boolean; _errors: string[]; }

export default function ImportModal({ open, onClose, onImport }: Props) {
  const { lookups, patch: patchLookups } = useLookups();
  const [step, setStep]         = useState(1);
  const [headers, setHeaders]   = useState<string[]>([]);
  const [rawRows, setRawRows]   = useState<Record<string, string>[]>([]);
  const [mapping, setMapping]   = useState<Record<string, string>>({});
  const [preview, setPreview]   = useState<PreviewRow[]>([]);
  const [fileInfo, setFileInfo] = useState('');
  const [loading, setLoading]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult]     = useState<BulkImportResult | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef                 = useRef<HTMLInputElement>(null);

  const importStage =
    progress < 35 ? 'Validating rows...' :
    progress < 72 ? 'Creating risks...' :
    'Finalising...';

  useEffect(() => {
    if (!loading) return;
    const tick = setInterval(() => {
      setProgress(prev => {
        if (prev < 40) return Math.min(prev + 4,   40);
        if (prev < 70) return Math.min(prev + 1.5, 70);
        if (prev < 88) return Math.min(prev + 0.3, 88);
        return prev;
      });
    }, 200);
    return () => clearInterval(tick);
  }, [loading]);

  if (!open) return null;

  function reset() {
    setStep(1); setHeaders([]); setRawRows([]); setMapping({});
    setPreview([]); setFileInfo(''); setResult(null); setError(null);
    setProgress(0);
  }

  function downloadTemplate() {
    const csv = IMP_FIELDS.map(f => f.label).join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'smartrisk_import_template.csv';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function handleClose() { reset(); onClose(); }

  function parseFile(file: File) {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['csv', 'xlsx', 'xls'].includes(ext)) {
      setError('Only .xlsx, .xls, and .csv files are accepted.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb  = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array', cellDates: true });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false });
        if (!data.length) { setError('No data found in file.'); return; }
        const hdrs = Object.keys(data[0]).filter(h => !h.startsWith('__EMPTY'));
        setHeaders(hdrs);
        setRawRows(data as Record<string, string>[]);
        // Auto-map headers
        const m: Record<string, string> = {};
        IMP_FIELDS.forEach(f => {
          const match = hdrs.find(h => AUTO_MAP[normalize(h)] === f.key);
          if (match) m[f.key] = match;
        });
        setMapping(m);
        setFileInfo(`✅ ${file.name} — ${data.length} rows detected`);
        setError(null);
      } catch {
        setError('Failed to parse file. Ensure row 1 contains column headers.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }

  function mappingValid(): boolean {
    return REQUIRED_KEYS.every(k => !!mapping[k]);
  }

  function buildPreview() {
    const rows: PreviewRow[] = rawRows.map(raw => {
      const get = (key: string) => (mapping[key] ? String(raw[mapping[key]] ?? '').trim() : '');
      const errors: string[] = [];
      REQUIRED_KEYS.forEach(k => {
        if (!get(k)) errors.push(IMP_FIELDS.find(f => f.key === k)?.label ?? k);
      });
      const lik = Number(get('likelihood'));
      const imp = Number(get('impact_score'));
      if (get('likelihood') && (isNaN(lik) || lik < 1 || lik > 5)) errors.push('Likelihood must be 1–5');
      if (get('impact_score') && (isNaN(imp) || imp < 1 || imp > 5)) errors.push('Impact Score must be 1–5');

      return {
        category:              get('category'),
        description:           get('description'),
        owner:                 get('owner'),
        treatment:             (get('treatment') || 'Mitigate') as BulkImportRow['treatment'],
        likelihood:            lik || 3,
        impact_score:          imp || 3,
        primary_impact:        get('primary_impact') || undefined,
        logged_at:             get('logged_at') || undefined,
        controls:              get('controls') || undefined,
        control_effectiveness: get('control_effectiveness') ? Number(get('control_effectiveness')) : undefined,
        mitigation_plan:       get('mitigation_plan') || undefined,
        comments:              get('comments') || undefined,
        _valid:                errors.length === 0,
        _errors:               errors,
      };
    });
    setPreview(rows);
  }

  function goNext() {
    if (step === 1) { setStep(2); }
    else if (step === 2) { buildPreview(); setStep(3); }
    else if (step === 3) { handleImport(); }
  }

  function goBack() {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  }

  async function autoAddToLookups(rows: BulkImportRow[]) {
    if (!lookups) return;

    const unique = (arr: string[]) => [...new Set(arr.filter(Boolean))];

    const ciMatch = (list: string[], val: string) =>
      list.some(e => e.toLowerCase() === val.toLowerCase());

    const newCategories = unique(rows.map(r => r.category))
      .filter(v => !ciMatch(lookups.category, v));

    const newOwners = unique(rows.map(r => r.owner))
      .filter(v => !ciMatch(lookups.risk_owner, v));

    const newTreatments = unique(rows.map(r => r.treatment as string))
      .filter(v => !ciMatch(lookups.treatment, v));

    const patch: Record<string, string[]> = {};
    if (newCategories.length) patch.category   = [...lookups.category,   ...newCategories];
    if (newOwners.length)     patch.risk_owner = [...lookups.risk_owner, ...newOwners];
    if (newTreatments.length) patch.treatment  = [...lookups.treatment,  ...newTreatments];

    if (Object.keys(patch).length) {
      await patchLookups(patch);
    }
  }

  async function handleImport() {
    const valid = preview.filter(r => r._valid);
    if (!valid.length) return;
    setProgress(0);
    setLoading(true);
    setError(null);
    try {
      const seen = new Set<string>();
      const rows: BulkImportRow[] = valid
        .filter(r => {
          const key = `${r.description.toLowerCase().trim()}|${r.category.toLowerCase().trim()}|${r.owner.toLowerCase().trim()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map(r => ({
          category:              r.category,
          description:           r.description,
          owner:                 r.owner,
          treatment:             r.treatment,
          likelihood:            r.likelihood,
          impact_score:          r.impact_score,
          primary_impact:        r.primary_impact,
          logged_at:             r.logged_at,
          controls:              r.controls,
          control_effectiveness: r.control_effectiveness,
          mitigation_plan:       r.mitigation_plan,
          comments:              r.comments,
        }));
      const r = await onImport(rows);
      setProgress(100);
      await new Promise(res => setTimeout(res, 500));
      if (r) {
        setResult(r);
        await autoAddToLookups(rows);
        useFeedbackStore.getState().trigger('import_risk', 'How was the import experience?');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  const validRows   = preview.filter(r => r._valid).length;
  const invalidRows = preview.filter(r => !r._valid).length;

  const pillClass = (n: number) =>
    n < step ? 'imp-step-pill done' : n === step ? 'imp-step-pill active' : 'imp-step-pill';

  const nextLabel    = loading ? 'Importing...' : step === 1 ? 'Next →' : step === 2 ? 'Preview →' : `Import ${validRows} Risks`;
  const nextDisabled = (step === 1 && !rawRows.length) || (step === 2 && !mappingValid()) || (step === 3 && validRows === 0) || loading;

  return (
    <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal" style={{ width: 'min(820px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-hd">
          <h3 className="modal-title">Import Risks</h3>
          <button className="x" onClick={handleClose}>✕</button>
        </div>

        <div className="modal-bd" style={{ flex: 1, overflowY: 'auto' }}>
          {/* Step indicator */}
          <div className="imp-step-bar">
            <div className={pillClass(1)}>1 Upload</div>
            <div className="imp-step-line" />
            <div className={pillClass(2)}>2 Map</div>
            <div className="imp-step-line" />
            <div className={pillClass(3)}>3 Review</div>
          </div>

          {error && <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div>}

          {/* STEP 1: UPLOAD */}
          {step === 1 && !result && (
            <>
              <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.65, marginBottom: 12 }}>
                <strong style={{ color: '#1F2854' }}>What does this do?</strong> Upload your existing risk spreadsheet and SmartRisk will import all your risks automatically.
              </p>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 10, lineHeight: 1.75 }}>
                <strong style={{ color: '#1F2854' }}>Required:</strong> Category, Description, Owner, Likelihood, Impact Score, Treatment<br />
                <strong style={{ color: '#1F2854' }}>Optional:</strong> Primary Impact, Date Logged, Existing Controls, Control Effectiveness, Mitigation Plan, Comments
              </div>
              <p className="imp-checklist-title">Before you upload, check these 4 things:</p>
              <div className="imp-checklist">
                <div className="imp-checklist-item"><span className="imp-checklist-num">1</span><span>File must be <strong>.xlsx</strong> or <strong>.csv</strong> format</span></div>
                <div className="imp-checklist-item"><span className="imp-checklist-num">2</span><span><strong>Row 1 must be your column headers</strong> — risk data starts from row 2</span></div>
                <div className="imp-checklist-item"><span className="imp-checklist-num">3</span><span>Column names don't need to match exactly — you'll map them in the next step</span></div>
                <div className="imp-checklist-item"><span className="imp-checklist-num">4</span><span><strong>Likelihood</strong> and <strong>Impact Score</strong> must be numbers <strong>1 to 5</strong></span></div>
              </div>

              <div
                className={`imp-dropzone${dragging ? ' over' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <div className="imp-dropzone-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#01b88e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                  </svg>
                </div>
                <div className="imp-dropzone-title">Drop your file here or click to browse</div>
                <div className="imp-dropzone-sub">Accepts .xlsx, .xls, and .csv files only</div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileInput} />
              </div>

              {fileInfo && <div className="imp-file-info">{fileInfo}</div>}
            </>
          )}

          {/* STEP 2: MAP */}
          {step === 2 && (
            <>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
                Match your file's columns to SmartRisk fields. Required fields are marked <span style={{ color: '#ef4444' }}>*</span>
              </p>
              {!mappingValid() && (
                <div className="imp-map-error">
                  ⚠️ Required fields not yet mapped: <strong>
                    {REQUIRED_KEYS.filter(k => !mapping[k]).map(k => IMP_FIELDS.find(f => f.key === k)?.label).join(', ')}
                  </strong>. Assign a column for each before continuing.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {IMP_FIELDS.map(field => (
                  <div key={field.key} className="imp-map-row">
                    <div className="imp-map-label">
                      {field.label}{field.required && <span style={{ color: '#ef4444' }}> *</span>}
                    </div>
                    <div className="imp-map-arrow">→</div>
                    <select
                      className="imp-map-select"
                      value={mapping[field.key] ?? ''}
                      onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                    >
                      <option value="">— skip —</option>
                      {headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* LOADING STATE */}
          {loading && (
            <div className="imp-loading-wrap">
              <div className="imp-loading-icon">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#01b88e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div className="imp-loading-title">Importing risks...</div>
              <div className="imp-loading-sub">Please wait, this may take a moment.</div>
              <div className="imp-progress-track">
                <div className="imp-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="imp-progress-stage">{importStage}</div>
            </div>
          )}

          {/* STEP 3: REVIEW */}
          {step === 3 && !result && !loading && (
            <>
              <div className="imp-summary-bar">
                <span className="imp-badge-valid">✓ {validRows} valid</span>
                {invalidRows > 0 && <span className="imp-badge-invalid">{invalidRows} invalid</span>}
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <table className="imp-preview-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Owner</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className={row._valid ? 'imp-row-valid' : 'imp-row-invalid'}>
                        <td>{i + 1}</td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.description || '—'}
                        </td>
                        <td>{row.category || '—'}</td>
                        <td>{row.owner || '—'}</td>
                        <td>
                          {row._valid
                            ? <span className="imp-status-ok">✓ Valid</span>
                            : <span className="imp-status-err">Missing: {row._errors.join(', ')}</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* RESULT */}
          {result && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 26 }}>✓</div>
              <p style={{ fontSize: 32, fontWeight: 900, color: '#01b88e', margin: 0 }}>{result.imported}</p>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>risks imported successfully</p>
              {result.skipped > 0 && <p style={{ fontSize: 13, color: '#b45309', marginTop: 8 }}>{result.skipped} skipped (quota limit reached)</p>}
              {(result.duplicates ?? 0) > 0 && <p style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>{result.duplicates} skipped (already exist in register)</p>}
              {result.errors.length > 0 && <p style={{ fontSize: 13, color: '#dc2626', marginTop: 4 }}>{result.errors.length} rows had errors</p>}
            </div>
          )}
        </div>

        <div className="modal-ft" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 1 && !result && !loading && (
              <button className="btn btn-secondary" onClick={goBack}>← Back</button>
            )}
            {!result && (
              <button className="btn btn-secondary" onClick={downloadTemplate}>↓ Download Template</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={handleClose}>
              {result ? 'Close' : 'Cancel'}
            </button>
            {!result && (
              <button className="btn btn-primary" onClick={goNext} disabled={nextDisabled}>
                {nextLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}