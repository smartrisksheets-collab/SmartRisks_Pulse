# app/models/submission_token.py

import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
from app.db.base import Base


class SubmissionToken(Base):
    __tablename__ = "submission_tokens"

    id               = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id     = Column(PG_UUID(as_uuid=True), nullable=False)
    token            = Column(String, nullable=False, unique=True)
    label            = Column(String, nullable=False)
    department       = Column(String, nullable=False)
    issued_by        = Column(PG_UUID(as_uuid=True), nullable=False)
    issued_at        = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at       = Column(DateTime(timezone=True))
    revoked_at       = Column(DateTime(timezone=True))
    submission_count = Column(Integer, nullable=False, server_default="0")