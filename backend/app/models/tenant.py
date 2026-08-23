from sqlalchemy import Column, String, Integer, Boolean, Date, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB, ARRAY
from sqlalchemy.sql import func
import uuid
from app.db.base import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    industry = Column(String)
    plan = Column(String, nullable=False, server_default="TRIAL")
    trial_start_date = Column(Date, nullable=False, server_default=func.current_date())
    payment_active = Column(Boolean, nullable=False, server_default="false")
    payment_date = Column(Date)
    plan_expires_at = Column(Date)
    max_risks = Column(Integer, nullable=False, server_default="1000")
    max_users = Column(Integer, nullable=False, server_default="25")
    modules = Column(ARRAY(Text), nullable=False, server_default="'{risk}'")
    currency_symbol = Column(String, nullable=False, server_default="₦")
    logo_url = Column(String)
    org_size = Column(String)
    framework = Column(String)
    timezone = Column(String)
    date_format = Column(String)
    report_settings = Column(JSONB)
    workspace_settings = Column(JSONB)
    perm_version = Column(Integer, nullable=False, server_default="1")
    pin_hash = Column(String)
    pin_attempts = Column(Integer, nullable=False, server_default="0")
    pin_locked_until = Column(DateTime(timezone=True))
    created_by = Column(PG_UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())