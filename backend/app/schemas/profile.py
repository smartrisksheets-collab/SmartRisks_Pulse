"""My profile: the signed-in account's own name and photo."""

from pydantic import BaseModel, Field


class ProfileResponse(BaseModel):
    first_name: str
    last_name: str
    email: str
    avatar_url: str | None = None


class ProfileUpdate(BaseModel):
    first_name: str = Field(max_length=80)
    last_name: str = Field(max_length=80)
