from sqlalchemy import Column, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
from sqlalchemy import DateTime, ForeignKey
from app.db.base import Base


class IncidentSeverityRiskBandMap(Base):
    __tablename__ = "incident_severity_risk_band_map"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    severity_id = Column(PG_UUID(as_uuid=True), ForeignKey("incident_severity_levels.id", ondelete="CASCADE"), nullable=False)
    risk_band_label = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())