# app/models/appetite_threshold.py

from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func

from app.db.base import Base


class AppetiteThreshold(Base):
    __tablename__ = "appetite_thresholds"
    __table_args__ = (UniqueConstraint("tenant_id", "category"),)

    id        = Column(PG_UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    category  = Column(String, nullable=False)
    threshold = Column(Integer, nullable=False)
    rationale = Column(Text)
    set_by    = Column(String)
    set_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())