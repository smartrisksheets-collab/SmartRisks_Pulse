# app/models/report_draft.py

import uuid
from sqlalchemy import Column, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.sql import func
from app.db.base import Base


class ReportDraft(Base):
    """One saved Report Builder draft per person per workspace (migration 065)."""
    __tablename__ = "report_drafts"

    id         = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id  = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(PG_UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    payload    = Column(JSONB, nullable=False, server_default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
