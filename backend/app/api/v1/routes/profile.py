# app/api/v1/routes/profile.py
"""My profile: GET and PATCH /me, POST and DELETE /me/photo.

Account level, so a signed-in account is enough (get_current_account).
The email is shown read-only and can't be changed here.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_account, get_db
from app.core.rate_limit import limiter
from app.schemas.profile import ProfileUpdate
from app.services import profile as profile_svc
from app.services.settings import LOGO_MAX_BYTES

router = APIRouter(prefix="/me", tags=["profile"])


def _ok(data: object) -> dict:
    return {"data": data, "error": None, "meta": {}}


@router.get("", response_model=dict)
@limiter.limit("60/minute")
async def get_me(
    request: Request,
    claims: dict = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return _ok((await profile_svc.get_profile(db, UUID(claims["sub"]))).model_dump())


@router.patch("", response_model=dict)
@limiter.limit("20/minute")
async def update_me(
    request: Request,
    payload: ProfileUpdate,
    claims: dict = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return _ok((await profile_svc.update_profile(db, UUID(claims["sub"]), payload)).model_dump())


@router.post("/photo", response_model=dict)
@limiter.limit("5/minute")
async def upload_photo(
    request: Request,
    file: UploadFile = File(...),
    claims: dict = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> dict:
    content = await file.read(LOGO_MAX_BYTES + 1)
    return _ok((await profile_svc.set_photo(db, UUID(claims["sub"]), content)).model_dump())


@router.delete("/photo", response_model=dict)
@limiter.limit("10/minute")
async def delete_photo(
    request: Request,
    claims: dict = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return _ok((await profile_svc.remove_photo(db, UUID(claims["sub"]))).model_dump())
