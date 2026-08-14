from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.sql import func
import uuid
from app.db.base import Base


class ExternalSubmission(Base):
    __tablename__ = "external_submissions"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    submission_type = Column(String, nullable=False)
    payload = Column(JSONB, nullable=False)
    submitter_email = Column(String)
    status = Column(String, nullable=False, server_default="PENDING")
    reviewed_by = Column(String)
    return_message = Column(String)
    reviewed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
