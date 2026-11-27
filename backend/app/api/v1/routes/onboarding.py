# app/api/v1/routes/onboarding.py
"""Setup wizard: options, the account's draft, and finish.

These run before the account has a workspace, so they need a signed-in
account only (get_current_account), never an active workspace.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_account, get_db
from app.core.rate_limit import limiter
from app.schemas.onboarding import OnboardingDraftSave
from app.services import onboarding as onboarding_svc

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.get("/options", response_model=dict)
@limiter.limit("60/minute")
async def get_options(
    request: Request,
    claims: dict = Depends(get_current_account),
) -> dict:
    return {"data": onboarding_svc.get_options().model_dump(), "error": None, "meta": {}}


@router.get("/draft", response_model=dict)
@limiter.limit("60/minute")
async def get_draft(
    request: Request,
    claims: dict = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> dict:
    draft = await onboarding_svc.get_draft(db, UUID(claims["sub"]))
    return {"data": draft.model_dump(mode="json") if draft else None, "error": None, "meta": {}}


@router.put("/draft", response_model=dict)
@limiter.limit("60/minute")
async def save_draft(
    request: Request,
    payload: OnboardingDraftSave,
    claims: dict = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> dict:
    draft = await onboarding_svc.save_draft(db, UUID(claims["sub"]), payload)
    return {"data": draft.model_dump(mode="json"), "error": None, "meta": {}}


@router.post("/finish", response_model=dict)
@limiter.limit("5/minute")
async def finish(
    request: Request,
    claims: dict = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await onboarding_svc.finish(db, UUID(claims["sub"]), str(claims.get("email", "")))
    return {"data": result.model_dump(), "error": None, "meta": {}}
