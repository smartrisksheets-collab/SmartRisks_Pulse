# app/schemas/appetite.py

from __future__ import annotations
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class AppetiteThresholdUpsert(BaseModel):
    category:  str
    threshold: int   = Field(..., ge=1, le=25)
    rationale: str | None = None


class AppetiteThresholdResponse(BaseModel):
    id:        UUID
    tenant_id: UUID
    category:  str
    threshold: int
    rationale: str | None
    set_by:    str | None
    set_at:    datetime | None
    updated_at: datetime | None

    model_config = {'from_attributes': True}