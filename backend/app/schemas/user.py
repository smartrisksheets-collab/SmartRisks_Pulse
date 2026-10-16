from pydantic import BaseModel, EmailStr, field_validator
from uuid import UUID

_ROLES: frozenset[str] = frozenset({"Owner", "Manager", "Analyst"})


class AddMemberRequest(BaseModel):
    email: EmailStr
    name: str
    role: str = "Analyst"

    @field_validator("role")
    @classmethod
    def _valid_role(cls, v: str) -> str:
        if v not in _ROLES:
            raise ValueError("Role must be Owner, Manager or Analyst.")
        return v


class UpdateMemberRequest(BaseModel):
    name: str | None = None
    role: str | None = None
    permissions: dict[str, bool] | None = None
    reset_permissions: bool = False

    @field_validator("role")
    @classmethod
    def _valid_role(cls, v: str | None) -> str | None:
        if v is not None and v not in _ROLES:
            raise ValueError("Role must be Owner, Manager or Analyst.")
        return v


class WorkspaceMemberResponse(BaseModel):
    id: UUID
    account_id: UUID
    email: str
    name: str | None
    role: str
    status: str
    permissions: dict | None

    class Config:
        from_attributes = True


class CreateWorkspaceRequest(BaseModel):
    name: str
    org_name: str | None = None
    industry: str | None = None
    org_size: str | None = None
    framework: str | None = None
    timezone: str | None = None
    date_format: str | None = None
    currency: str | None = None


class WorkspaceResponse(BaseModel):
    id: UUID
    name: str
    industry: str | None
    plan: str
    modules: list[str]
    max_risks: int
    max_users: int
    currency_symbol: str

    class Config:
        from_attributes = True
