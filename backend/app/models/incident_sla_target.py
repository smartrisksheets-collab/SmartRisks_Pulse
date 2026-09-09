from sqlalchemy import Column, Text, Numeric
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
from sqlalchemy import DateTime, ForeignKey
from app.db.base import Base


class IncidentSlaTarget(Base):
    __tablename__ = "incident_sla_targets"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    severity_id = Column(PG_UUID(as_uuid=True), ForeignKey("incident_severity_levels.id", ondelete="CASCADE"), nullable=False)
    target_value = Column(Numeric, nullable=False)
    target_unit = Column(Text, nullable=False, server_default="hours")
    target_hours = Column(Numeric, nullable=False)
    notify_on_log = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())