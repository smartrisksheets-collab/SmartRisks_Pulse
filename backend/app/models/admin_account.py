import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.db.base import Base


class AdminAccount(Base):
    __tablename__ = "admin_accounts"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email         = Column(String, nullable=False, unique=True, index=True)
    name          = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    role          = Column(String, nullable=False, default="admin")
    status        = Column(String, nullable=False, default="ACTIVE")
    last_login    = Column(DateTime(timezone=True), nullable=True)
    created_by    = Column(UUID(as_uuid=True), ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at    = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)