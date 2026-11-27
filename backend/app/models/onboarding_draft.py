# app/models/onboarding_draft.py

import uuid
from sqlalchemy import Column, DateTime, ForeignKey, SmallInteger
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.sql import func
from app.db.base import Base


class OnboardingDraft(Base):
    """Setup wizard answers so far, one row per account (migration 073)."""
    __tablename__ = "onboarding_drafts"

    id         = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id = Column(PG_UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, unique=True)
    step       = Column(SmallInteger, nullable=False, server_default="1")
    data       = Column(JSONB, nullable=False, server_default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
