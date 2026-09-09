from sqlalchemy import Column, String, Numeric, Date, Text, ForeignKey, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db.base import Base


class Payment(Base):
    __tablename__ = "payments"

    id          = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    tenant_id   = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    amount      = Column(Numeric(12, 2), nullable=False)
    currency    = Column(String(10), nullable=False, server_default="USD")
    method      = Column(String(60))
    reference   = Column(String(120))
    notes       = Column(Text)
    paid_at     = Column(Date, nullable=False)
    recorded_by = Column(String(120))
    created_at  = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())