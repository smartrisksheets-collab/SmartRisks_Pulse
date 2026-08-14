from pydantic import BaseModel, EmailStr
from uuid import UUID


class AddMemberRequest(BaseModel):
    email: EmailStr
    name: str
    role: str = "Analyst"


class UpdateMemberRequest(BaseModel):
    name: str | None = None
    role: str | None = None
    permissions: dict | None = None
    reset_permissions: bool = False


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
    industry: str | None = None


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
