from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.admin_security import decode_admin_token
from app.core.exceptions import InvalidTokenError, PermissionDeniedError
from app.core.dependencies import get_db
from app.models.admin_account import AdminAccount


async def get_current_admin(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> AdminAccount:
    if not authorization or not authorization.startswith("Bearer "):
        raise InvalidTokenError("Admin token missing.")

    token = authorization.removeprefix("Bearer ").strip()
    payload = decode_admin_token(token)

    if not payload or not payload.get("sub"):
        raise InvalidTokenError("Invalid or expired admin token.")

    result = await db.execute(
        select(AdminAccount).where(AdminAccount.id == payload["sub"])
    )
    admin = result.scalar_one_or_none()

    if not admin or str(admin.status) != "ACTIVE":
        raise PermissionDeniedError("Admin account inactive or not found.")

    return admin


async def require_super_admin(
    admin: AdminAccount = Depends(get_current_admin),
) -> AdminAccount:
    if str(admin.role) != "super_admin":
        raise PermissionDeniedError("Super admin access required.")
    return admin