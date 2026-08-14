from sqlalchemy import (
    Column,
    String,
    Integer,
    Numeric,
    Date,
    DateTime,
    ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.sql import func
import uuid
from app.db.base import Base


class SnapshotMonthly(Base):
    __tablename__ = "snapshots_monthly"
    __table_args__ = (UniqueConstraint("tenant_id", "month_key"),)

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    month_key = Column(String, nullable=False)
    month_label = Column(String)
    month_date = Column(Date)
    avg_residual = Column(Numeric)
    high_risk_count = Column(Integer)
    total_risks = Column(Integer)
    control_effectiveness = Column(Numeric)
    open_incidents = Column(Integer)
    avg_mttr = Column(Numeric)
    financial_impact = Column(Numeric)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SnapshotDaily(Base):
    __tablename__ = "snapshots_daily"
    __table_args__ = (UniqueConstraint("tenant_id", "date_key"),)

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    date_key = Column(String, nullable=False)
    snapshot_data = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
