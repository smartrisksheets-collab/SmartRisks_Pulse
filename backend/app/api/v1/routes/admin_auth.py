from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.admin_deps import get_current_admin
from app.models.admin_account import AdminAccount
from app.schemas.admin import AdminLoginRequest, AdminTokenResponse
from app.services import admin_auth as admin_auth_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/auth/login")
async def login(
    payload: AdminLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await admin_auth_service.login(
        email=payload.email,
        password=payload.password,
        db=db,
    )
    return {"data": result, "error": None, "meta": {}}


@router.get("/auth/me")
async def me(admin: AdminAccount = Depends(get_current_admin)):
    return {
        "data": {
            "id": str(admin.id),
            "email": str(admin.email),
            "name": str(admin.name),
            "role": str(admin.role),
        },
        "error": None,
        "meta": {},
    }