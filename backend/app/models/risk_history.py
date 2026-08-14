from sqlalchemy import Column, String, Numeric, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
import uuid
from app.db.base import Base


class RiskHistory(Base):
    __tablename__ = "risk_history"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    risk_id = Column(String)
    residual_score = Column(Numeric)
    changed_by = Column(String)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())
