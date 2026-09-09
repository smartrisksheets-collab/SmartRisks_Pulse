import uuid
from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.db.base import Base


class ApiErrorLog(Base):
    __tablename__ = "api_error_log"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id    = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True)
    method       = Column(String, nullable=False)
    path         = Column(String, nullable=False)
    status_code  = Column(Integer, nullable=False, index=True)
    error_detail = Column(Text, nullable=True)
    request_body = Column(JSONB, nullable=True)
    duration_ms  = Column(Integer, nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)