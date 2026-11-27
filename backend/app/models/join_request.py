from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
import uuid
from app.db.base import Base


class JoinRequest(Base):
    """Someone with the workspace's email domain asking to join (076)."""

    __tablename__ = "join_requests"
    __table_args__ = (UniqueConstraint("tenant_id", "account_id", name="uq_join_requests_tenant_account"),)

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(PG_UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    status = Column(String, nullable=False, server_default="PENDING")
    decided_by = Column(String)
    decided_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
