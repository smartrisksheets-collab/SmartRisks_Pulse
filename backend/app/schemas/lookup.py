# app/schemas/lookup.py

from datetime import datetime
from pydantic import BaseModel, field_validator
from app.schemas.limits import LookupList


class LookupResponse(BaseModel):
    category:          list[str]
    treatment:         list[str]
    risk_owner:        list[str]
    incident_category: list[str]
    incident_severity: list[str]
    business_unit:     list[str]
    incident_category_map: dict[str, list[str]] = {}
    updated_at:        datetime | None

    model_config = {'from_attributes': True}


class LookupUsageResponse(BaseModel):
    field: str
    value: str
    count: int


class LookupPatch(BaseModel):
    category:          LookupList | None = None
    treatment:         LookupList | None = None
    risk_owner:        LookupList | None = None
    incident_category: LookupList | None = None
    incident_severity: LookupList | None = None
    business_unit:     LookupList | None = None
    incident_category_map: dict[str, list[str]] | None = None

    @field_validator("incident_category_map")
    @classmethod
    def _map_size(cls, v: dict[str, list[str]] | None) -> dict[str, list[str]] | None:
        if v is None:
            return v
        if len(v) > 500:
            raise ValueError("The category map is limited to 500 incident categories.")
        for key, cats in v.items():
            if len(key) > 200 or len(cats) > 500 or any(len(c) > 200 for c in cats):
                raise ValueError("Category names are limited to 200 characters and 500 per mapping.")
        return v
