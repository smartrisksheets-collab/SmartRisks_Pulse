# app/schemas/submission.py

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, EmailStr


# ── Token management ──────────────────────────────────────────────────────────

class SubmissionTokenCreate(BaseModel):
    label:      str
    department: str
    expires_at: datetime | None = None


class SubmissionTokenResponse(BaseModel):
    id:               UUID
    workspace_id:     UUID
    token:            str
    label:            str
    department:       str
    issued_by:        UUID
    issued_at:        datetime
    expires_at:       datetime | None
    revoked_at:       datetime | None
    submission_count: int

    model_config = {'from_attributes': True}


# ── Public form ───────────────────────────────────────────────────────────────

class TokenResolveResponse(BaseModel):
    label:      str
    department: str


class PublicSubmitRequest(BaseModel):
    submitter_name:     str   = Field(..., min_length=1, max_length=200)
    submitter_email:    EmailStr
    submission_type:    str   = Field(..., pattern=r'^(risk|incident)$')
    description:        str   = Field(..., min_length=20, max_length=5000)
    cause:              str | None = Field(None, max_length=2000)
    affects:            str | None = Field(None, max_length=1000)
    suggested_category: str | None = Field(None, max_length=100)
    existing_controls:  str | None = Field(None, max_length=2000)
    suggested_action:   str | None = Field(None, max_length=2000)
    submitter_urgency:  str | None = Field(None, pattern=r'^(now|soon|no_rush)$')
    attachment_url:     str | None = None
    # Honeypot — must be empty on legitimate submissions
    website:            str | None = Field(None, exclude=True)


class PublicSubmitResponse(BaseModel):
    reference: str
    message:   str


# ── Triage list and detail ────────────────────────────────────────────────────

class RiskSubmissionListItem(BaseModel):
    id:               UUID
    reference:        str
    submitted_at:     datetime
    department:       str
    submitter_name:   str
    submitter_email:  str
    description:      str
    submitter_urgency: str | None
    submission_type:  str
    status:           str

    model_config = {'from_attributes': True}


class RiskSubmissionResponse(BaseModel):
    id:                 UUID
    workspace_id:       UUID
    token_id:           UUID
    reference:          str
    submitter_name:     str
    submitter_email:    str
    department:         str
    submission_type:    str
    description:        str
    cause:              str | None
    affects:            str | None
    suggested_category: str | None
    existing_controls:  str | None
    suggested_action:   str | None
    submitter_urgency:  str | None
    attachment_url:     str | None
    status:             str
    triaged_by:         UUID | None
    triaged_at:         datetime | None
    triage_note:        str | None
    promoted_risk_id:   str | None
    submitted_at:       datetime
    submitter_ip:       str | None

    model_config = {'from_attributes': True}


# ── Triage actions ────────────────────────────────────────────────────────────

class TriageMergeRequest(BaseModel):
    target_risk_id: str
    note:           str = Field(..., min_length=1)


class TriageRerouteRequest(BaseModel):
    note: str = Field(..., min_length=1)


class TriageCloseRequest(BaseModel):
    note: str = Field(..., min_length=1)


# ── Promotion (Accept path) ───────────────────────────────────────────────────

class PromoteRequest(BaseModel):
    category:        str
    owner:           str
    likelihood:      int = Field(..., ge=1, le=5)
    impact_score:    int = Field(..., ge=1, le=5)
    treatment:       str = Field(..., pattern=r'^(Mitigate|Transfer|Accept|Avoid)$')
    controls:        str | None = None
    mitigation_plan: str | None = None
    target_date:     str | None = None
    owner_email:     str | None = None