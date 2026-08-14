# app/schemas/lookup.py

from datetime import datetime
from pydantic import BaseModel


class LookupResponse(BaseModel):
    category:          list[str]
    treatment:         list[str]
    risk_owner:        list[str]
    incident_category: list[str]
    incident_severity: list[str]
    business_unit:     list[str]
    updated_at:        datetime | None

    model_config = {'from_attributes': True}


class LookupUsageResponse(BaseModel):
    field: str
    value: str
    count: int


class LookupPatch(BaseModel):
    category:          list[str] | None = None
    treatment:         list[str] | None = None
    risk_owner:        list[str] | None = None
    incident_category: list[str] | None = None
    incident_severity: list[str] | None = None
    business_unit:     list[str] | None = None