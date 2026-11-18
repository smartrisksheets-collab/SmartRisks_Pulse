// src/pages/IncidentFormPage.tsx
// Full-page log and edit for an incident: /incidents/new and /incidents/:id/edit.

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import IncidentForm from '../components/incidents/IncidentForm';
import { createIncident, getIncident, updateIncident } from '../services/incidents';
import { invalidateIncidentQueries } from '../hooks/useIncidents';
import { useIncidentSeverity } from '../hooks/useIncidentSeverity';
import { useToast } from '../hooks/useToast';
import { useCanDo } from '../utils/permissions';
import { useFeedbackStore } from '../store/feedbackStore';
import { emptyIncidentForm, formFromIncident } from '../utils/incidentDisplay';
import type { IncidentCreate } from '../types/incident';

export default function IncidentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const canAddRisk = useCanDo('manage_risks');
  const { config: sevConfig } = useIncidentSeverity();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existing = useQuery({
    queryKey: ['incidents', 'one', id],
    queryFn: () => getIncident(id ?? ''),
    enabled: isEdit,
    staleTime: 0,
  });

  async function handleSubmit(payload: IncidentCreate) {
    setSaving(true);
    setError(null);
    try {
      const saved = isEdit && id ? await updateIncident(id, payload) : await createIncident(payload);
      invalidateIncidentQueries(qc);
      if (!isEdit) useFeedbackStore.getState().trigger('log_incident', 'How was logging your first incident?');
      toast(`${saved.id} saved.`, 'success');
      navigate(`/incidents?incident=${encodeURIComponent(saved.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The incident could not be saved. Please try again.');
      window.scrollTo({ top: 0 });
    } finally {
      setSaving(false);
    }
  }

  const back = isEdit && id ? `/incidents?incident=${encodeURIComponent(id)}` : '/incidents';
  const levels = (sevConfig.data?.levels ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);

  let body: React.ReactNode;
  if ((isEdit && existing.isLoading) || sevConfig.isLoading) {
    body = <p className="pl-caption" role="status">Loading the form…</p>;
  } else if (isEdit && (existing.isError || !existing.data)) {
    body = (
      <p className="pl-note pl-alert" role="alert">
        Incident {id} could not be opened. It may have been deleted. <Link to="/incidents">Back to Incidents</Link>
      </p>
    );
  } else {
    const initial = existing.data ? formFromIncident(existing.data) : emptyIncidentForm('');
    body = (
      <IncidentForm
        key={existing.data ? `${existing.data.id}-${existing.data.updated_at}` : 'new'}
        initial={initial}
        isEdit={isEdit}
        levels={levels}
        canAddRisk={canAddRisk}
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
        <Link className="pl-icon-btn" to={back} aria-label="Back to Incidents"><ArrowLeft size={18} aria-hidden="true" /></Link>
        <div className="pl-stack-0">
          <span className="pl-caption">Incidents</span>
          <h1 className="pl-page-title">{isEdit ? `Edit ${id}` : 'Log an incident'}</h1>
        </div>
      </div>
      {body}
    </div>
  );
}
