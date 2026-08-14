# app/models/matrix_config.py

import uuid
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
from app.db.base import Base


class MatrixConfig(Base):
    __tablename__ = "workspace_matrix_config"
    __table_args__ = (UniqueConstraint("tenant_id"),)

    id                = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id         = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    likelihood_scale  = Column(Integer, nullable=False, default=5)
    impact_scale      = Column(Integer, nullable=False, default=5)
    band_low_min      = Column(Integer, nullable=False, default=1)
    band_low_max      = Column(Integer, nullable=False, default=4)
    band_medium_min   = Column(Integer, nullable=False, default=5)
    band_medium_max   = Column(Integer, nullable=False, default=9)
    band_high_min     = Column(Integer, nullable=False, default=10)
    band_high_max     = Column(Integer, nullable=False, default=16)
    band_critical_min = Column(Integer, nullable=False, default=17)
    band_critical_max = Column(Integer, nullable=False, default=25)
    band_extreme_min  = Column(Integer, nullable=False, default=21)
    band_extreme_max  = Column(Integer, nullable=False, default=25)
    band_count        = Column(Integer, nullable=False, default=4)
    band_1_label      = Column(String, nullable=False, default='Low')
    band_5_label      = Column(String, nullable=False, default='Extreme')
    band_2_label      = Column(String, nullable=False, default='Medium')
    band_3_label      = Column(String, nullable=False, default='High')
    band_4_label      = Column(String, nullable=False, default='Critical')
    created_at        = Column(DateTime(timezone=True), server_default=func.now())
    updated_at        = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())