import asyncio
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.admin_security import create_admin_token
from app.core.exceptions import InvalidCredentialsError
from app.core.config import settings
from app.core.security import burn_password_check, verify_password
from app.models.admin_account import AdminAccount
from app.models.admin_audit_log import AdminAuditLog
from app.schemas.admin import AdminTokenResponse, AdminAccountBrief
from app.services import lockout


async def login(
    email: str,
    password: str,
    db: AsyncSession,
) -> AdminTokenResponse:
    result = await db.execute(
        select(AdminAccount).where(AdminAccount.email == email.lower())
    )
    admin = result.scalar_one_or_none()

    if not admin:
        await asyncio.to_thread(burn_password_check, password)
        raise InvalidCredentialsError("Invalid email or password.")

    admin_id = str(admin.id)
    locked = await lockout.locked_seconds(db, "admin_login", admin_id)
    if locked > 0:
        mins = lockout.minutes_left(locked)
        raise InvalidCredentialsError(
            f"Too many failed sign-in attempts. Try again in "
            f"{mins} minute{'s' if mins != 1 else ''}."
        )

    if not await asyncio.to_thread(verify_password, password, str(admin.password_hash)):
        await lockout.record_failure(
            "admin_login", admin_id,
            settings.ADMIN_LOGIN_MAX_ATTEMPTS, settings.ADMIN_LOCK_MINUTES,
        )
        raise InvalidCredentialsError("Invalid email or password.")

    if str(admin.status) != "ACTIVE":
        raise InvalidCredentialsError("Admin account is inactive.")

    await lockout.clear(db, "admin_login", admin_id)
    admin.last_login = datetime.now(timezone.utc)
    await db.flush()

    token = create_admin_token(str(admin.id), str(admin.role))

    return AdminTokenResponse(
        access_token=token,
        admin=AdminAccountBrief(
            id=str(admin.id),
            email=str(admin.email),
            name=str(admin.name),
            role=str(admin.role),
        ),
    )


async def write_audit_log(
    admin_id: str,
    action: str,
    target_type: str,
    target_id: str,
    db: AsyncSession,
    meta: dict | None = None,
) -> None:
    db.add(AdminAuditLog(
        admin_id=admin_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        meta=meta,
    ))
    await db.flush()