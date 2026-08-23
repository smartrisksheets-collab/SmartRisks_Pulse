import logging
import httpx

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

logger = logging.getLogger(__name__)
from datetime import timedelta, datetime, timezone
from uuid import UUID
from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, create_reset_token, verify_pin, decode_token, hash_password, verify_password
from app.core.exceptions import (
    InvalidCredentialsError, ResourceNotFoundError,
    InvalidPINError, WorkspaceLimitError, InvalidTokenError,
    DuplicateResourceError
)
from app.models.account import Account
from app.models.tenant import Tenant
from app.models.workspace_member import WorkspaceMember



# Maps role name to the key prefix used in workspace_settings perm_* fields
_PERM_ROLE_KEY: dict[str, str] = {
    "Owner":   "owner",
    "Manager": "mgr",
    "Analyst": "analyst",
}

# Maps JWT permission key to workspace_settings field suffix
_PERM_MAP: dict[str, str] = {
    "manage_risks":     "risks",
    "manage_incidents": "inc",
    "generate_ai":      "ai",
    "print_reports":    "print",
    "manage_users":     "users",
}

# Fallback defaults when workspace_settings has no value yet (fresh workspace)
_PERM_DEFAULTS: dict[str, bool] = {
    "perm_owner_risks": True,  "perm_mgr_risks": True,  "perm_analyst_risks": False,
    "perm_owner_inc":   True,  "perm_mgr_inc":   True,  "perm_analyst_inc":   True,
    "perm_owner_ai":    True,  "perm_mgr_ai":    True,  "perm_analyst_ai":    False,
    "perm_owner_print": True,  "perm_mgr_print": True,  "perm_analyst_print": True,
    "perm_owner_users": True,  "perm_mgr_users": False, "perm_analyst_users": False,
}


def _role_permissions(role: str, ws: dict) -> dict[str, bool]:
    rk = _PERM_ROLE_KEY.get(role, "analyst")
    perms: dict[str, bool] = {}
    for perm_name, suffix in _PERM_MAP.items():
        key = f"perm_{rk}_{suffix}"
        perms[perm_name] = bool(ws.get(key, _PERM_DEFAULTS.get(key, False)))
    # manage_settings is Owner-only, not workspace-configurable
    perms["manage_settings"] = (role == "Owner")
    # review_resolve follows manage_incidents
    perms["review_resolve"] = perms["manage_incidents"]
    return perms


def _build_workspace_token(account: Account, member: WorkspaceMember, tenant: Tenant) -> str:
    ws: dict = dict(tenant.workspace_settings or {})  # type: ignore[arg-type]
    permissions = (
        dict(member.permissions)  # type: ignore[arg-type]
        if member.permissions is not None
        else _role_permissions(str(member.role or "Analyst"), ws)
    )
    return create_access_token({
        "sub":              str(account.id),
        "email":            account.email,
        "active_tenant_id": str(tenant.id),
        "role":             member.role,
        "permissions":      permissions,
        "perm_version":     int(tenant.perm_version or 1),  # type: ignore[arg-type]
        "plan":             tenant.plan,
        "trial_expires_at": (
            (tenant.trial_start_date + timedelta(days=14)).isoformat()
            if str(tenant.plan) == "TRIAL" else None
        ),
        "modules":          tenant.modules,
        "workspaces":       [],
    })


async def login(db: AsyncSession, email: str, password: str) -> dict:
    account = await db.scalar(select(Account).where(Account.email == email.lower()))
    if not account or not account.password_hash:
        raise InvalidCredentialsError("Invalid email or password")
    if not verify_password(password, str(account.password_hash)):
        raise InvalidCredentialsError("Invalid email or password")

    account.last_login = datetime.now(timezone.utc)  # type: ignore[assignment]
    db.add(account)
    await db.flush()

    members = (await db.execute(
        select(WorkspaceMember, Tenant)
        .join(Tenant, Tenant.id == WorkspaceMember.tenant_id)
        .where(WorkspaceMember.account_id == account.id)
        .where(WorkspaceMember.status == "ACTIVE")
    )).all()

    if not members:
        base_token = create_access_token({"sub": str(account.id), "email": account.email, "workspaces": []})
        refresh = create_refresh_token(str(account.id), account.token_version)  # type: ignore[arg-type]
        return {"access_token": base_token, "refresh_token": refresh, "requires_workspace_select": False}

    workspaces = [
        {"tenant_id": str(t.id), "name": t.name, "role": m.role, "plan": t.plan, "modules": t.modules}
        for m, t in members
    ]

    if len(members) == 1:
        member, tenant = members[0]
        requires_pin = bool(tenant.pin_hash)
        if requires_pin:
            base_token = create_access_token({
                "sub": str(account.id), "email": account.email,
                "pending_tenant_id": str(tenant.id), "workspaces": workspaces
            })
            refresh = create_refresh_token(str(account.id), account.token_version)  # type: ignore[arg-type]
            return {"access_token": base_token, "refresh_token": refresh, "requires_pin": True, "workspaces": workspaces}

        token = _build_workspace_token(account, member, tenant)
        refresh = create_refresh_token(str(account.id), account.token_version)  # type: ignore[arg-type]
        return {"access_token": token, "refresh_token": refresh, "workspaces": workspaces}

    base_token = create_access_token({"sub": str(account.id), "email": account.email, "workspaces": workspaces})
    refresh = create_refresh_token(str(account.id), account.token_version)  # type: ignore[arg-type]
    return {"access_token": base_token, "refresh_token": refresh, "requires_workspace_select": True, "workspaces": workspaces}


async def select_workspace(db: AsyncSession, claims: dict, tenant_id: str) -> dict:
    account_id = UUID(claims["sub"])
    result = await db.execute(
        select(WorkspaceMember, Tenant)
        .join(Tenant, Tenant.id == WorkspaceMember.tenant_id)
        .where(WorkspaceMember.account_id == account_id)
        .where(WorkspaceMember.tenant_id == UUID(tenant_id))
        .where(WorkspaceMember.status == "ACTIVE")
    )
    row = result.first()
    if not row:
        raise ResourceNotFoundError("Workspace not found or access denied")

    member, tenant = row
    if tenant.pin_hash:
        base_token = create_access_token({
            "sub": str(account_id), "email": claims["email"],
            "pending_tenant_id": tenant_id, "workspaces": claims.get("workspaces", [])
        })
        return {"access_token": base_token, "requires_pin": True}

    account = await db.get(Account, account_id)
    token = _build_workspace_token(account, member, tenant)
    refresh = create_refresh_token(str(account_id), account.token_version)  # type: ignore[arg-type]
    return {"access_token": token, "refresh_token": refresh}


async def verify_pin_and_issue_token(db: AsyncSession, claims: dict, pin: str) -> dict:
    from datetime import datetime, timezone, timedelta
    tenant_id = claims.get("pending_tenant_id")
    if not tenant_id:
        raise InvalidTokenError("No pending workspace in token")

    account_id = UUID(claims["sub"])
    result = await db.execute(
        select(WorkspaceMember, Tenant)
        .join(Tenant, Tenant.id == WorkspaceMember.tenant_id)
        .where(WorkspaceMember.account_id == account_id)
        .where(WorkspaceMember.tenant_id == UUID(tenant_id))
    )
    row = result.first()
    if not row:
        raise ResourceNotFoundError("Workspace not found")

    member, tenant = row

    if tenant.pin_locked_until and tenant.pin_locked_until > datetime.now(timezone.utc):
        raise InvalidPINError("PIN is locked. Try again in 15 minutes.")

    if not verify_pin(pin, tenant.pin_hash):
        tenant.pin_attempts = (tenant.pin_attempts or 0) + 1
        if tenant.pin_attempts >= 5:
            tenant.pin_locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
            tenant.pin_attempts = 0
        await db.flush()
        raise InvalidPINError("Incorrect PIN")

    tenant.pin_attempts = 0
    tenant.pin_locked_until = None
    await db.flush()

    account = await db.get(Account, account_id)
    token = _build_workspace_token(account, member, tenant)
    refresh = create_refresh_token(str(account_id), account.token_version)  # type: ignore[arg-type]
    return {"access_token": token, "refresh_token": refresh}


async def refresh_access_token(db: AsyncSession, refresh_token: str) -> dict:
    claims = decode_token(refresh_token)
    if not claims or claims.get("type") != "refresh":
        raise InvalidTokenError("Invalid refresh token")

    account_id = UUID(claims["sub"])
    account = await db.get(Account, account_id)
    if not account:
        raise InvalidTokenError("Account not found")

    if claims.get("token_version") != account.token_version:
        raise InvalidTokenError("Token has been revoked")

    result = await db.execute(
        select(WorkspaceMember, Tenant)
        .join(Tenant, Tenant.id == WorkspaceMember.tenant_id)
        .where(WorkspaceMember.account_id == account_id)
        .where(WorkspaceMember.status == "ACTIVE")
    )
    rows = result.all()
    if not rows:
        # Account exists but has no workspaces yet, user is mid-onboarding.
        # Issue a fresh base token so they can complete workspace creation.
        new_refresh = create_refresh_token(str(account_id), account.token_version)  # type: ignore[arg-type]
        base_token = create_access_token({
            "sub": str(account_id),
            "email": str(account.email or ""),
            "workspaces": [],
        })
        return {"access_token": base_token, "refresh_token": new_refresh}

    member, tenant = rows[0]
    token = _build_workspace_token(account, member, tenant)
    new_refresh = create_refresh_token(str(account_id), account.token_version)  # type: ignore[arg-type]
    return {"access_token": token, "refresh_token": new_refresh}


async def forgot_password(db: AsyncSession, email: str, frontend_url: str) -> dict:
    from app.services.email import send_reset_email
    account = await db.scalar(select(Account).where(Account.email == email.lower()))
    if account and account.password_hash:
        token = create_reset_token(str(account.id), str(account.email))
        reset_link = f"{frontend_url}/reset-password?token={token}"
        try:
            import asyncio
            await asyncio.get_event_loop().run_in_executor(
                None, send_reset_email, str(account.email), reset_link
            )
        except Exception as exc:
            logger.error("forgot_password: email failed | %s", exc)
    # Always return success to avoid leaking whether email exists
    return {"message": "If that email exists, a reset link has been sent."}


async def reset_password(db: AsyncSession, token: str, new_password: str) -> dict:
    claims = decode_token(token)
    if not claims or claims.get("type") != "reset":
        raise InvalidTokenError("Invalid or expired reset link.")
    account_id = UUID(claims["sub"])
    account = await db.get(Account, account_id)
    if not account:
        raise InvalidTokenError("Invalid or expired reset link.")
    account.password_hash = hash_password(new_password)  # type: ignore[assignment]
    account.token_version = (int(account.token_version or 1)) + 1  # type: ignore[assignment]
    db.add(account)
    await db.flush()
    return {"message": "Password updated. Please sign in with your new password."}


async def register(db: AsyncSession, email: str, password: str, name: str) -> dict:
    existing = await db.scalar(select(Account).where(Account.email == email.lower()))

    if existing:
        member_count = await db.scalar(
            select(func.count()).where(WorkspaceMember.account_id == existing.id)
        )
        if member_count > 0:
            raise DuplicateResourceError("An account with this email already exists. Please sign in.")

        if not existing.password_hash:
            raise InvalidCredentialsError("This email is registered via an invite. Please use your invite link to set a password.")
        if not verify_password(password, str(existing.password_hash)):
            raise InvalidCredentialsError("An account with this email exists. Check your password and sign in instead.")

        base_token = create_access_token({
            "sub": str(existing.id),
            "email": existing.email,
            "workspaces": [],
        })
        refresh = create_refresh_token(str(existing.id), existing.token_version)  # type: ignore[arg-type]
        return {
            "access_token": base_token,
            "refresh_token": refresh,
            "workspaces": [],
            "incomplete_onboarding": True,
        }

    account = Account(
        email=email.lower(),
        name=name,
        password_hash=hash_password(password),
    )
    db.add(account)
    await db.flush()

    base_token = create_access_token({
        "sub": str(account.id),
        "email": account.email,
        "workspaces": [],
    })
    refresh = create_refresh_token(str(account.id), account.token_version)  # type: ignore[arg-type]
    return {"access_token": base_token, "refresh_token": refresh, "workspaces": []}


async def google_auth(db: AsyncSession, access_token: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        info_resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if info_resp.status_code != 200:
        raise InvalidCredentialsError("Invalid Google token")

    info = info_resp.json()
    email = str(info.get("email", "")).lower()
    if not email:
        raise InvalidCredentialsError("Could not retrieve email from Google account")

    name = str(info.get("name", "")) or email.split("@")[0]

    account = await db.scalar(select(Account).where(Account.email == email))
    if not account:
        account = Account(email=email, name=name)
        db.add(account)
        await db.flush()

    members = (await db.execute(
        select(WorkspaceMember, Tenant)
        .join(Tenant, Tenant.id == WorkspaceMember.tenant_id)
        .where(WorkspaceMember.account_id == account.id)
        .where(WorkspaceMember.status == "ACTIVE")
    )).all()

    if not members:
        base_token = create_access_token({"sub": str(account.id), "email": account.email, "workspaces": []})
        refresh = create_refresh_token(str(account.id), account.token_version)  # type: ignore[arg-type]
        return {"access_token": base_token, "refresh_token": refresh}

    workspaces = [
        {"tenant_id": str(t.id), "name": t.name, "role": m.role, "plan": t.plan, "modules": t.modules}
        for m, t in members
    ]

    if len(members) == 1:
        member, tenant = members[0]
        if tenant.pin_hash:
            base_token = create_access_token({
                "sub": str(account.id), "email": account.email,
                "pending_tenant_id": str(tenant.id), "workspaces": workspaces,
            })
            refresh = create_refresh_token(str(account.id), account.token_version)  # type: ignore[arg-type]
            return {"access_token": base_token, "refresh_token": refresh, "requires_pin": True, "workspaces": workspaces}

        token = _build_workspace_token(account, member, tenant)
        refresh = create_refresh_token(str(account.id), account.token_version)  # type: ignore[arg-type]
        return {"access_token": token, "refresh_token": refresh, "workspaces": workspaces}

    base_token = create_access_token({"sub": str(account.id), "email": account.email, "workspaces": workspaces})
    refresh = create_refresh_token(str(account.id), account.token_version)  # type: ignore[arg-type]
    return {"access_token": base_token, "refresh_token": refresh, "requires_workspace_select": True, "workspaces": workspaces}