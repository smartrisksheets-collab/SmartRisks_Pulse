from fastapi import Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import AsyncSessionLocal
from app.core.security import decode_token
from app.core.exceptions import InvalidTokenError, PermissionDeniedError, TrialExpiredError, PlanExpiredError

bearer = HTTPBearer()


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_current_account(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    claims = decode_token(credentials.credentials)
    if not claims or "sub" not in claims:
        raise InvalidTokenError("Invalid or expired token")
    if claims.get("type") != "access":
        raise InvalidTokenError("Invalid token type")
    return claims


async def get_active_tenant(
    claims: dict = Depends(get_current_account),
) -> dict:
    tenant_id = claims.get("active_tenant_id")
    if not tenant_id:
        raise InvalidTokenError("No active workspace in token")

    plan = claims.get("plan")
    if plan == "EXPIRED":
        raise PlanExpiredError("This workspace has expired. Please renew to continue.")

    trial_expires = claims.get("trial_expires_at")
    if trial_expires and plan == "TRIAL":
        from datetime import datetime, timezone, timedelta, date
        exp_dt = datetime(
            *date.fromisoformat(trial_expires[:10]).timetuple()[:3],
            tzinfo=timezone.utc,
        ) + timedelta(days=1)
        if datetime.now(timezone.utc) >= exp_dt:
            raise TrialExpiredError("Your trial has expired.")

    return claims


def require_permission(permission: str):
    async def _check(claims: dict = Depends(get_active_tenant)) -> dict:
        if not claims.get("permissions", {}).get(permission):
            raise PermissionDeniedError(f"Permission denied: {permission} required")
        return claims
    return _check


def require_module(module: str):
    async def _check(claims: dict = Depends(get_active_tenant)) -> dict:
        if module not in claims.get("modules", []):
            raise PermissionDeniedError(f"Module not enabled: {module}")
        return claims
    return _check