from sqlalchemy import Column, Text, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
from sqlalchemy import DateTime, ForeignKey
from app.db.base import Base


class IncidentEscalationRule(Base):
    __tablename__ = "incident_escalation_rules"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)
    auto_escalate_on_breach = Column(Boolean, nullable=False, server_default="false")
    escalate_to = Column(Text, nullable=False, server_default="admin")
    flag_unowned_after_hours = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())