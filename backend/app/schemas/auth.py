from pydantic import BaseModel, EmailStr, field_validator
import re

_PW_RE = re.compile(
    r'^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$'
)

def _validate_password(v: str) -> str:
    if not _PW_RE.match(v):
        raise ValueError(
            "Password must be at least 8 characters and include "
            "an uppercase letter, a lowercase letter, a number, "
            "and a special character."
        )
    return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class WorkspaceSelectRequest(BaseModel):
    tenant_id: str


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def _strong(cls, v: str) -> str:
        return _validate_password(v)


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

    @field_validator("password")
    @classmethod
    def _strong(cls, v: str) -> str:
        return _validate_password(v)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token:    str
    password: str

    @field_validator("password")
    @classmethod
    def _strong(cls, v: str) -> str:
        return _validate_password(v)


class GoogleAuthRequest(BaseModel):
    access_token: str
