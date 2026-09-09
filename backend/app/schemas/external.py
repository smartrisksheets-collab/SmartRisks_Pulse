# app/schemas/external.py
from __future__ import annotations
from datetime import datetime
import re
from pydantic import BaseModel, Field, field_validator

_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

def _validate_optional_email(v: str) -> str:
    if not v:
        return v
    if not _EMAIL_RE.match(v):
        raise ValueError("must be a valid email address")
    return v.lower().strip()


# ── Public submission schemas ─────────────────────────────────────────────────

class ExternalRiskSubmit(BaseModel):
    submitter_name:  str = Field(..., min_length=1)
    submitter_email: str = ""

    @field_validator("submitter_email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _validate_optional_email(v)
    department:      str = ""
    category:        str = Field(..., min_length=1)
    description:     str = Field(..., min_length=1)
    primary_impact:  str = ""
    likelihood:      int = Field(..., ge=1, le=5)
    impact_score:    int = Field(..., ge=1, le=5)
    treatment:       str = ""
    controls:        str = ""
    comments:        str = ""


class ExternalIncidentSubmit(BaseModel):
    reported_by:      str = Field(..., min_length=1)
    reporter_email:   str = ""

    @field_validator("reporter_email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _validate_optional_email(v)
    date_reported:    str = ""
    channel:          str = ""
    description:      str = Field(..., min_length=1)
    category:         str = Field(..., min_length=1)
    incident_type:    str = ""
    severity:         str = "Medium"
    business_unit:    str = ""
    incident_date:    str = ""
    incident_time:    str = ""
    affected_asset:   str = ""
    financial_impact: str = ""
    actions_taken:    str = ""


class ExternalSubmitResponse(BaseModel):
    id:     str
    status: str


# ── Auth-required schemas ─────────────────────────────────────────────────────

class PendingSubmissionItem(BaseModel):
    id:              str
    submission_type: str
    submitter_name:  str
    submitter_email: str
    submitted_at:    datetime
    category:        str
    description:     str
    payload:         dict


class PendingListResponse(BaseModel):
    items: list[PendingSubmissionItem]
    total: int


class PendingCountResponse(BaseModel):
    count: int


class ApproveRequest(BaseModel):
    reviewer_notes: str = ""


class ReturnRequest(BaseModel):
    return_message: str = Field(..., min_length=1)