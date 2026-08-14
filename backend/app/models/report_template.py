# app/models/report_template.py

import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy import DateTime
from app.db.base import Base


class ReportTemplate(Base):
    __tablename__ = "report_templates"

    id          = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id   = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    name        = Column(String(255), nullable=False)
    description = Column(String(1000))
    report_type = Column(String(100))
    blocks      = Column(JSONB, nullable=False, server_default="'[]'")
    settings    = Column(JSONB, nullable=False, server_default="'{}'")
    is_default  = Column(Boolean, nullable=False, server_default="false")
    created_by  = Column(String(255))
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ReportSettings(Base):
    __tablename__ = "report_settings"

    id         = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id  = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, unique=True)
    settings   = Column(JSONB, nullable=False, server_default="'{}'")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())