# app/services/invite.py
# Invite token lifecycle: generate → email → validate → accept.

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import InvalidTokenError, ResourceNotFoundError
from app.core.security import create_access_token, create_refresh_token
from app.models.account import Account
from app.models.tenant import Tenant
from app.models.workspace_member import WorkspaceMember

logger = logging.getLogger(__name__)

_INVITE_TTL_HOURS = 48
_INVITE_TYPE      = "invite"


def generate_invite_token(email: str, tenant_id: UUID, role: str) -> str:
    payload = {
        "type":      _INVITE_TYPE,
        "email":     email.lower(),
        "tenant_id": str(tenant_id),
        "role":      role,
        "exp":       datetime.now(timezone.utc) + timedelta(hours=_INVITE_TTL_HOURS),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _decode(token: str) -> dict:
    try:
        claims = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
    except jwt.ExpiredSignatureError:
        raise InvalidTokenError("Invite link has expired. Ask the workspace admin to resend.")
    except jwt.PyJWTError:
        raise InvalidTokenError("Invalid invite link.")
    if claims.get("type") != _INVITE_TYPE:
        raise InvalidTokenError("Invalid invite link.")
    return claims


async def validate_invite(db: AsyncSession, token: str) -> dict:
    claims    = _decode(token)
    email     = str(claims["email"])
    tenant_id = UUID(claims["tenant_id"])
    role      = str(claims["role"])

    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise ResourceNotFoundError("Workspace not found.")

    account = await db.scalar(select(Account).where(Account.email == email))
    is_existing_user = account is not None and bool(account.password_hash)

    return {
        "email":            email,
        "workspace_name":   str(tenant.name or ""),
        "role":             role,
        "is_existing_user": is_existing_user,
    }


async def accept_invite(db: AsyncSession, token: str, password: str) -> dict:
    from app.services.auth import _build_workspace_token
    from app.core.security import hash_password

    claims    = _decode(token)
    email     = str(claims["email"])
    tenant_id = UUID(claims["tenant_id"])

    account = await db.scalar(select(Account).where(Account.email == email))
    if not account:
        raise InvalidTokenError("Account not found. Contact your workspace admin.")

    member_result = await db.execute(
        select(WorkspaceMember)
        .where(WorkspaceMember.account_id == account.id)
        .where(WorkspaceMember.tenant_id == tenant_id)
        .where(WorkspaceMember.status == "ACTIVE")
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise InvalidTokenError("Invite is no longer valid. Contact your workspace admin.")

    account.password_hash = hash_password(password)  # type: ignore[assignment]
    await db.flush()

    tenant = await db.get(Tenant, tenant_id)
    workspace_token = _build_workspace_token(account, member, tenant)  # type: ignore[arg-type]
    refresh         = create_refresh_token(
        str(account.id), int(account.token_version or 1)  # type: ignore[arg-type]
    )

    return {
        "access_token": workspace_token,
        "refresh_token": refresh,
        "workspaces": [{
            "tenant_id": str(tenant_id),
            "name":      str(tenant.name or ""),  # type: ignore[union-attr]
            "role":      str(member.role or ""),
            "plan":      str(tenant.plan or ""),  # type: ignore[union-attr]
            "modules":   list(tenant.modules or []),  # type: ignore[union-attr]
        }],
    }