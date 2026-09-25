# app/models/dashboard_brief.py

from sqlalchemy import Column, DateTime, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.sql import func

from app.db.base import Base


class DashboardBrief(Base):
    __tablename__ = "dashboard_briefs"

    tenant_id    = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True)
    paragraphs   = Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    facts_hash   = Column(Text, nullable=False)
    generated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    generated_by = Column(Text)