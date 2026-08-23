from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class WorkspaceSelectRequest(BaseModel):
    tenant_id: str


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class PINVerifyRequest(BaseModel):
    pin: str


class WorkspaceInfo(BaseModel):
    tenant_id: str
    name: str
    role: str
    plan: str
    modules: list[str]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    workspaces: list[WorkspaceInfo] = []
    requires_workspace_select: bool = False
    requires_pin: bool = False


class ValidateInviteResponse(BaseModel):
    email:            str
    workspace_name:   str
    role:             str
    is_existing_user: bool


class AcceptInviteRequest(BaseModel):
    token:    str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token:    str
    password: str


class GoogleAuthRequest(BaseModel):
    access_token: str
