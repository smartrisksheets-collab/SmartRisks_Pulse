from sqlalchemy import Column, String, Integer, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
from sqlalchemy import DateTime, ForeignKey
from app.db.base import Base


class IncidentSeverityLevel(Base):
    __tablename__ = "incident_severity_levels"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    label = Column(Text, nullable=False)
    sort_order = Column(Integer, nullable=False, server_default="0")
    color = Column(Text, nullable=False, server_default="#64748b")
    criteria_text = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())