# app/models/risk_submission.py

import uuid
from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
from app.db.base import Base


class RiskSubmission(Base):
    __tablename__ = "risk_submissions"

    id                 = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id       = Column(PG_UUID(as_uuid=True), nullable=False)
    token_id           = Column(PG_UUID(as_uuid=True), nullable=False)
    reference          = Column(String, nullable=False)
    submitter_name     = Column(String, nullable=False)
    submitter_email    = Column(String, nullable=False)
    department         = Column(String, nullable=False)
    submission_type    = Column(String, nullable=False, server_default="risk")
    description        = Column(Text, nullable=False)
    cause              = Column(Text)
    affects            = Column(Text)
    suggested_category = Column(String)
    existing_controls  = Column(Text)
    suggested_action   = Column(Text)
    submitter_urgency  = Column(String)
    attachment_url     = Column(String)
    status             = Column(String, nullable=False, server_default="pending")
    triaged_by         = Column(PG_UUID(as_uuid=True))
    triaged_at         = Column(DateTime(timezone=True))
    triage_note        = Column(Text)
    promoted_risk_id   = Column(String)
    submitted_at       = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    submitter_ip       = Column(String)