# app/models/incident.py

from sqlalchemy import (
    Column,
    String,
    Numeric,
    Date,
    DateTime,
    ForeignKey,
    PrimaryKeyConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
from app.db.base import Base


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (PrimaryKeyConstraint("id", "tenant_id"),)

    id = Column(String, nullable=False)
    tenant_id = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    title = Column(String)
    description = Column(String)
    category = Column(String)
    severity = Column(String)
    priority = Column(String)
    status = Column(String, server_default="Open")
    root_cause = Column(String)
    assigned_to = Column(String)
    reported_by = Column(String)
    reported_at = Column(Date)
    reporter_email = Column(String)
    channel = Column(String)
    incident_type = Column(String)
    incident_dt = Column(DateTime(timezone=True))
    location = Column(String)
    impact_summary = Column(String)
    affected_asset = Column(String)
    business_unit = Column(String)
    linked_risk_id = Column(String)
    immediate_actions = Column(String)
    evidence_link = Column(String)
    analyst_notes = Column(String)
    containment_date = Column(Date)
    tags = Column(String)
    review_status = Column(String)
    risk_impacted = Column(String)
    resolution_summary = Column(String)
    resolved_at = Column(DateTime(timezone=True))
    financial_impact = Column(Numeric)
    ai_impact = Column(String)
    ai_actions = Column(String)
    ai_status = Column(String)
    ai_last_generated = Column(DateTime(timezone=True))
    deleted_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )