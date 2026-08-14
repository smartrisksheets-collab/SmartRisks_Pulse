from sqlalchemy import (
    Column,
    String,
    Integer,
    Numeric,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    PrimaryKeyConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
from app.db.base import Base


class Risk(Base):
    __tablename__ = "risks"
    __table_args__ = (PrimaryKeyConstraint("id", "tenant_id"),)

    id = Column(String, nullable=False)
    tenant_id = Column(PG_UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    category = Column(String)
    description = Column(String)
    primary_impact = Column(String)
    owner = Column(String)
    owner_email = Column(String)
    logged_at = Column(Date)
    likelihood = Column(Integer)
    impact_score = Column(Integer)
    severity = Column(Numeric)
    level = Column(String)
    treatment = Column(String)
    controls = Column(String)
    control_effectiveness = Column(Integer)
    residual = Column(Numeric)
    overall_rating = Column(Numeric)
    mitigation_plan = Column(String)
    comments = Column(String)
    ai_insight = Column(String)
    score_delta = Column(Numeric, server_default="0")
    movement = Column(String)
    freshness = Column(String)
    target_date = Column(Date)
    mitigation_status = Column(String, server_default="Open")
    last_reviewed_at = Column(DateTime(timezone=True))
    control_last_tested = Column(Date)
    control_test_result = Column(String, server_default="Not Tested")
    source       = Column(String, nullable=False, server_default='internal')
    level_index  = Column(Integer)
    is_elevated  = Column(Boolean, nullable=False, server_default='false')
    deleted_at   = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
