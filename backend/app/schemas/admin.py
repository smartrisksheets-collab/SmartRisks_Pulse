from datetime import date, datetime
from pydantic import BaseModel, EmailStr, field_validator
import re

_PW_RE = re.compile(
    r'^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$'
)


# ── Auth ──────────────────────────────────────────────────────────────────────

class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


class AdminAccountBrief(BaseModel):
    id: str
    email: str
    name: str
    role: str


class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin: AdminAccountBrief


# ── Admin account management ──────────────────────────────────────────────────

class AdminAccountCreate(BaseModel):
    email: EmailStr
    name: str
    password: str
    role: str = "admin"

    @field_validator("password")
    @classmethod
    def _strong(cls, v: str) -> str:
        if not _PW_RE.match(v):
            raise ValueError(
                "Password must be at least 12 characters and include "
                "an uppercase letter, a lowercase letter, a number, "
                "and a special character."
            )
        return v

    @field_validator("role")
    @classmethod
    def _valid_role(cls, v: str) -> str:
        if v not in {"super_admin", "admin"}:
            raise ValueError("Role must be super_admin or admin.")
        return v


class AdminAccountUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    status: str | None = None

    @field_validator("role")
    @classmethod
    def _valid_role(cls, v: str | None) -> str | None:
        if v is not None and v not in {"super_admin", "admin"}:
            raise ValueError("Role must be super_admin or admin.")
        return v

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: str | None) -> str | None:
        if v is not None and v not in {"ACTIVE", "INACTIVE"}:
            raise ValueError("Status must be ACTIVE or INACTIVE.")
        return v


class AdminAccountOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    status: str
    last_login: datetime | None
    created_at: datetime


# ── Workspace management ──────────────────────────────────────────────────────

class AdminWorkspaceListItem(BaseModel):
    id: str
    name: str
    industry: str | None
    plan: str
    status: str          # derived: ACTIVE, TRIAL, EXPIRED, SUSPENDED
    payment_active: bool
    payment_date: date | None
    plan_expires_at: date | None
    modules: list[str]
    max_users: int
    max_risks: int
    member_count: int
    risk_count: int
    incident_count: int
    first_risk_at: datetime | None   # activation signal
    created_at: datetime
    owner_email: str | None = None
    owner_name: str | None = None


class AdminWorkspaceUpdate(BaseModel):
    plan: str | None = None
    payment_active: bool | None = None
    payment_date: date | None = None
    plan_expires_at: date | None = None
    max_users: int | None = None
    max_risks: int | None = None
    modules: list[str] | None = None
    industry: str | None = None
    workspace_status: str | None = None   # ACTIVE, SUSPENDED (requires migration 049)

    @field_validator("plan")
    @classmethod
    def _valid_plan(cls, v: str | None) -> str | None:
        if v is not None and v not in {"TRIAL", "PAID", "EXPIRED"}:
            raise ValueError("Plan must be TRIAL, PAID, or EXPIRED.")
        return v

    @field_validator("workspace_status")
    @classmethod
    def _valid_ws_status(cls, v: str | None) -> str | None:
        if v is not None and v not in {"ACTIVE", "SUSPENDED"}:
            raise ValueError("Workspace status must be ACTIVE or SUSPENDED.")
        return v

    @field_validator("modules")
    @classmethod
    def _valid_modules(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            valid = {"risk", "incident"}
            invalid = set(v) - valid
            if invalid:
                raise ValueError(f"Invalid modules: {invalid}")
        return v


# ── Platform overview ─────────────────────────────────────────────────────────

class AdminOverviewStats(BaseModel):
    total_workspaces: int
    active_paid: int
    on_trial: int
    expired: int
    suspended: int
    new_this_week: int
    trials_expiring_7d: int
    trial_conversion_rate: float     # % of trials that converted to paid
    activation_rate: float           # % of workspaces that logged at least 1 risk


# ── User intelligence ─────────────────────────────────────────────────────────

class AccountWorkspaceLimitUpdate(BaseModel):
    max_workspaces: int


class AdminUserListItem(BaseModel):
    id: str
    email: str
    name: str
    last_login: datetime | None
    last_seen: datetime | None
    workspace_count: int
    max_workspaces: int
    created_at: datetime
    is_ghost: bool       # signed up, never logged a risk in any workspace


# ── API error log ─────────────────────────────────────────────────────────────

class AdminErrorLogItem(BaseModel):
    id: str
    tenant_id: str | None
    method: str
    path: str
    status_code: int
    error_detail: str | None
    request_body: dict | None
    duration_ms: int | None
    created_at: datetime


class AdminErrorSummary(BaseModel):
    total_errors: int
    errors_5xx: int
    errors_4xx: int
    top_paths: list[dict]    # [{path, count}]
    errors_by_hour: list[dict]   # [{hour, count}] last 24h


# ── Admin audit log ───────────────────────────────────────────────────────────

class AdminAuditLogItem(BaseModel):
    id: str
    admin_id: str | None
    admin_name: str | None
    action: str
    target_type: str
    target_id: str
    meta: dict | None
    created_at: datetime
    

class PaymentUpdate(BaseModel):
    amount: float | None = None
    currency: str | None = None
    method: str | None = None
    reference: str | None = None
    notes: str | None = None
    paid_at: str | None = None


class PaymentCreate(BaseModel):
    amount: float
    currency: str = "USD"
    method: str | None = None
    reference: str | None = None
    notes: str | None = None
    paid_at: str  # ISO date string YYYY-MM-DD


class PaymentOut(BaseModel):
    id: str
    tenant_id: str
    amount: float
    currency: str
    method: str | None
    reference: str | None
    notes: str | None
    paid_at: str
    recorded_by: str | None
    created_at: str