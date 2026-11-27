"""Join by email domain: the Admin switch, requests, and what a newcomer sees."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class JoinDomainSetting(BaseModel):
    enabled: bool
    domain: str | None           # the domain in use, when on
    your_domain: str             # the Admin's own sign-in domain, the only one they can switch on
    allowed: bool                # False for personal email domains (gmail.com and others)


class JoinDomainUpdate(BaseModel):
    enabled: bool


class JoinableWorkspace(BaseModel):
    tenant_id: str
    name: str
    request_status: Literal["NONE", "PENDING", "APPROVED", "DECLINED"]


class JoinRequestItem(BaseModel):
    id: str
    email: str
    name: str | None
    requested_at: datetime


class JoinApprove(BaseModel):
    role: Literal["Manager", "Analyst"] | None = None
