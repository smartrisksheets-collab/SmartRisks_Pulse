import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
from app.db.base import Base


class AccountIdentity(Base):
    __tablename__ = "account_identities"
    __table_args__ = (
        UniqueConstraint("account_id", "provider", name="uq_account_identities_account_provider"),
    )

    id               = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id       = Column(PG_UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    provider         = Column(String, nullable=False)
    provider_subject = Column(String, nullable=True)
    last_used_at     = Column(DateTime(timezone=True), nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)