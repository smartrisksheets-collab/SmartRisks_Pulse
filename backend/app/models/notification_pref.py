from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
import uuid
from app.db.base import Base


class NotificationPref(Base):
    __tablename__ = "notification_prefs"
    __table_args__ = (UniqueConstraint("tenant_id", "user_email"),)

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    user_email = Column(String, nullable=False)
    brief_frequency = Column(String, server_default="daily")
    opted_out = Column(Boolean, server_default="false")
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
