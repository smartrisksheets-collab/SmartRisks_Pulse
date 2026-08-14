from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.sql import func
import uuid
from app.db.base import Base


class RecycleBin(Base):
    __tablename__ = "recycle_bin"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    item_type = Column(String, nullable=False)
    item_id = Column(String, nullable=False)
    item_data = Column(JSONB, nullable=False)
    deleted_by = Column(String)
    purge_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
