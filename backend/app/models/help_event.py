import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
from app.db.base import Base


class HelpEvent(Base):
    __tablename__ = "help_events"

    id         = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id  = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(PG_UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    event      = Column(String, nullable=False)
    entry_id   = Column(String, nullable=True)
    query      = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)