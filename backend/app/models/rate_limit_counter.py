# app/models/rate_limit_counter.py

from sqlalchemy import Column, String, Integer, DateTime
from sqlalchemy.sql import func
from app.db.base import Base


class RateLimitCounter(Base):
    __tablename__ = "rate_limit_counters"

    key          = Column(String, primary_key=True)
    window_start = Column(DateTime(timezone=True), nullable=False)
    count        = Column(Integer, nullable=False, server_default="0")
    updated_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)