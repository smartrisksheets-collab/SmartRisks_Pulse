# app/models/lookup.py

import uuid
from sqlalchemy import Column, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, ARRAY
from sqlalchemy.sql import func
from app.db.base import Base


class Lookup(Base):
    __tablename__ = "lookups"
    __table_args__ = (UniqueConstraint("tenant_id"),)

    id              = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id       = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    category        = Column(ARRAY(Text), server_default="ARRAY[]::TEXT[]")
    treatment       = Column(ARRAY(Text), server_default="ARRAY[]::TEXT[]")
    likelihood      = Column(ARRAY(Text), server_default="ARRAY[]::TEXT[]")
    impact_level    = Column(ARRAY(Text), server_default="ARRAY[]::TEXT[]")
    risk_owner      = Column(ARRAY(Text), server_default="ARRAY[]::TEXT[]")
    incident_category = Column(ARRAY(Text), server_default="ARRAY[]::TEXT[]")
    incident_severity = Column(ARRAY(Text), server_default="ARRAY[]::TEXT[]")
    business_unit   = Column(ARRAY(Text), server_default="ARRAY[]::TEXT[]")
    updated_at      = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())