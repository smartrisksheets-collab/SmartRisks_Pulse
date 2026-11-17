// src/pages/RiskFormPage.tsx
// Full-page add and edit for a risk: /risks/new (optional ?category=) and /risks/:id/edit.

import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import RiskForm from '../components/risks/RiskForm';
import { EMPTY_RISK_FORM, formFromRisk } from '../utils/riskForm';
import { createRisk, getRisk, removeEvidence, updateRisk, uploadEvidence } from '../services/risks';
import { invalidateRiskQueries } from '../hooks/useRisks';
import { useLookups } from '../hooks/useLookups';
import { useToast } from '../hooks/useToast';
import { useFeedbackStore } from '../store/feedbackStore';
import type { EvidenceChange, Risk, RiskCreate } from '../types/risk';
import type { SavedEvidence } from '../components/risks/EvidenceField';

/** Uploads or removes the evidence document. Returns an error message, or null when it worked. */
async function applyEvidence(id: string, change: EvidenceChange): Promise<string | null> {
  try {
    if (change.file) await uploadEvidence(id, change.file);
    else if (change.remove) await removeEvidence(id);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'The evidence file could not be saved.';
  }
}

function savedEvidenceOf(r: Risk | undefined): SavedEvidence | null {
  if (!r || !r.has_evidence) return null;
  return {
    riskId: r.id, version: r.updated_at, name: r.evidence_name ?? 'Evidence', mime: r.evidence_mime ?? '',
    size: r.evidence_size, uploadedAt: r.evidence_uploaded_at, uploadedBy: r.evidence_uploaded_by,
  };
}

export default function RiskFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const { lookups } = useLookups();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const existing = useQuery({
    queryKey: ['risks', 'one', id],
    queryFn: () => getRisk(id ?? ''),
    enabled: isEdit,
    staleTime: 0,
  });

  const linkCategory = params.get('category');
  const category = linkCategory && lookups?.category.includes(linkCategory) ? linkCategory : '';

  async function handleSubmit(payload: RiskCreate, addAnother: boolean, evidence: EvidenceChange) {
    setSaving(true);
    setError(null);
    try {
      if (isEdit && id) {
        await updateRisk(id, payload);
        const evErr = await applyEvidence(id, evidence);
        invalidateRiskQueries(qc);
        if (evErr) {
          // The risk is saved; stay on the form so the file can be tried again.
          setError(`${id} saved, but the evidence was not updated: ${evErr}`);
          window.scrollTo({ top: 0 });
          return;
        }
        toast(`${id} saved.`, 'success');
        navigate(`/risks?risk=${encodeURIComponent(id)}`);
        return;
      }
      const created = await createRisk(payload);
      const evErr = await applyEvidence(created.id, evidence);
      invalidateRiskQueries(qc);
      if (evErr) {
        // The risk exists now, so carry on in its edit form to retry the upload.
        toast(`${created.id} saved, but the evidence was not uploaded: ${evErr}`, 'error');
        navigate(`/risks/${encodeURIComponent(created.id)}/edit`);
        return;
      }
      useFeedbackStore.getState().trigger('add_risk', 'How was adding your first risk?');
      if (addAnother) {
        toast(`${created.id} saved. Add the next one.`, 'success');
        setFormKey(k => k + 1);
        window.scrollTo({ top: 0 });
        return;
      }
      toast(`${created.id} saved.`, 'success');
      navigate(`/risks?risk=${encodeURIComponent(created.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The risk could not be saved. Please try again.');
      window.scrollTo({ top: 0 });
    } finally {
      setSaving(false);
    }
  }

  const back = isEdit && id ? `/risks?risk=${encodeURIComponent(id)}` : '/risks';

  let body: React.ReactNode;
  if (isEdit && existing.isLoading) {
    body = <p className="pl-caption" role="status">Loading {id}…</p>;
  } else if (isEdit && (existing.isError || !existing.data)) {
    body = (
      <p className="pl-note pl-alert" role="alert">
        Risk {id} could not be opened. It may have been deleted. <Link to="/risks">Back to the Risk Register</Link>
      </p>
    );
  } else if (!isEdit && lookups == null) {
    body = <p className="pl-caption" role="status">Loading the form…</p>;
  } else {
    const initial = existing.data ? formFromRisk(existing.data) : { ...EMPTY_RISK_FORM, category };
    body = (
      <RiskForm
        key={existing.data ? `${existing.data.id}-${existing.data.updated_at}` : `new-${formKey}`}
        initial={initial}
        savedEvidence={savedEvidenceOf(existing.data)}
        isEdit={isEdit}
        saving={saving}
        error={error}
        onSubmit={handleSubmit}
        onCancel={() => navigate(back)}
      />
    );
  }

  return (
    <div className="pl-app pl-an-page">
      <div className="pl-inline">
        <Link className="pl-icon-btn" to={back} aria-label="Back to the Risk Register"><ArrowLeft size={18} aria-hidden="true" /></Link>
        <div className="pl-stack-0">
          <span className="pl-caption">Risk Register</span>
          <h1 className="pl-page-title">{isEdit ? `Edit ${id}` : 'Add a risk'}</h1>
        </div>
      </div>
      {body}
    </div>
  );
}
