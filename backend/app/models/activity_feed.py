from sqlalchemy import Column, String, Numeric, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
import uuid
from app.db.base import Base


class ActivityFeed(Base):
    __tablename__ = "activity_feed"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    risk_id = Column(String)
    risk_title = Column(String)
    action_type = Column(String)
    old_value = Column(Numeric)
    new_value = Column(Numeric)
    user_email = Column(String)
    category = Column(String)
    level = Column(String)
    label = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
