"""
My profile: the signed-in account's name and photo.

Account level, not workspace level, so it needs a signed-in account only.
Names go through account_name so name, first_name and last_name stay in step.
The photo lives in the workspace-logos bucket under avatars/<account id>/;
the weekly orphan sweep keeps any file an account still points at.
"""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundError, ValidationError
from app.models.account import Account
from app.schemas.profile import ProfileResponse, ProfileUpdate
from app.services.account_name import clean_name, set_account_name, split_full_name
from app.services.settings import _delete_logo_from_storage, upload_image


async def _account(db: AsyncSession, account_id: UUID) -> Account:
    acc = (await db.execute(select(Account).where(Account.id == account_id))).scalar_one_or_none()
    if acc is None:
        raise ResourceNotFoundError("Account not found.")
    return acc


def _response(acc: Account) -> ProfileResponse:
    first = clean_name(acc.first_name)  # type: ignore[arg-type]
    last = clean_name(acc.last_name)  # type: ignore[arg-type]
    if not first and not last:
        # An account the 072 backfill has not reached yet.
        first, last = split_full_name(acc.name)  # type: ignore[arg-type]
    return ProfileResponse(
        first_name=first,
        last_name=last,
        email=str(acc.email),
        avatar_url=acc.avatar_url or None,  # type: ignore[arg-type]
    )


async def get_profile(db: AsyncSession, account_id: UUID) -> ProfileResponse:
    return _response(await _account(db, account_id))


async def update_profile(db: AsyncSession, account_id: UUID, payload: ProfileUpdate) -> ProfileResponse:
    first = clean_name(payload.first_name)
    last = clean_name(payload.last_name)
    if not first:
        raise ValidationError("Enter your first name.")
    if not last:
        raise ValidationError("Enter your last name.")
    acc = await _account(db, account_id)
    set_account_name(acc, first, last)
    await db.flush()
    return _response(acc)


async def set_photo(db: AsyncSession, account_id: UUID, content: bytes) -> ProfileResponse:
    acc = await _account(db, account_id)
    old = acc.avatar_url
    acc.avatar_url = await upload_image(content, f"avatars/{account_id}", "Photo")  # type: ignore[assignment]
    await db.flush()
    if old:
        await _delete_logo_from_storage(str(old))
    return _response(acc)


async def remove_photo(db: AsyncSession, account_id: UUID) -> ProfileResponse:
    acc = await _account(db, account_id)
    old = acc.avatar_url
    acc.avatar_url = None  # type: ignore[assignment]
    await db.flush()
    if old:
        await _delete_logo_from_storage(str(old))
    return _response(acc)
