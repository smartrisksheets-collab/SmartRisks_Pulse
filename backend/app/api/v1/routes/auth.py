from fastapi import APIRouter, Depends, Response, Cookie, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_db, get_current_account
from app.core.rate_limit import limiter
from app.core.config import settings
from app.schemas.auth import (
    LoginRequest, RegisterRequest, WorkspaceSelectRequest,
    PINVerifyRequest, AcceptInviteRequest,
    ForgotPasswordRequest, ResetPasswordRequest, GoogleAuthRequest,
)
from app.services import auth as auth_service
from app.services import invite as invite_service

router = APIRouter(prefix="/auth", tags=["auth"])

_COOKIE_OPTS = dict(httponly=True, secure=True, samesite="lax", max_age=60 * 60 * 24 * 7)


def _set_refresh(response: Response, result: dict) -> None:
    if "refresh_token" in result:
        response.set_cookie("refresh_token", result.pop("refresh_token"), **_COOKIE_OPTS)


@router.post("/login")
@limiter.limit("5/minute")
async def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    result = await auth_service.login(db, payload.email, payload.password)
    _set_refresh(response, result)
    return {"data": result, "error": None, "meta": {}}

@router.post("/register")
@limiter.limit("3/minute")
async def register(
    request: Request,
    payload: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    result = await auth_service.register(db, payload.email, payload.password, payload.name)
    _set_refresh(response, result)
    return {"data": result, "error": None, "meta": {}}


@router.post("/select-workspace")
@limiter.limit("10/minute")
async def select_workspace(
    request: Request,
    payload: WorkspaceSelectRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_current_account),
):
    result = await auth_service.select_workspace(db, claims, payload.tenant_id)
    _set_refresh(response, result)
    return {"data": result, "error": None, "meta": {}}


@router.post("/verify-pin")
@limiter.limit("10/minute")
async def verify_pin(
    request: Request,
    payload: PINVerifyRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_current_account),
):
    result = await auth_service.verify_pin_and_issue_token(db, claims, payload.pin)
    _set_refresh(response, result)
    return {"data": result, "error": None, "meta": {}}


@router.post("/refresh")
@limiter.limit("20/minute")
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    refresh_token: str | None = Cookie(default=None),
):
    result = await auth_service.refresh_access_token(db, refresh_token or "")
    _set_refresh(response, result)
    return {"data": result, "error": None, "meta": {}}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("refresh_token")
    return {"data": {"message": "Logged out"}, "error": None, "meta": {}}


@router.get("/validate-invite")
@limiter.limit("20/minute")
async def validate_invite(
    request: Request,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    result = await invite_service.validate_invite(db, token)
    return {"data": result, "error": None, "meta": {}}


@router.post("/accept-invite")
@limiter.limit("5/minute")
async def accept_invite(
    request: Request,
    payload: AcceptInviteRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    result = await invite_service.accept_invite(db, payload.token, payload.password)
    _set_refresh(response, result)
    return {"data": result, "error": None, "meta": {}}


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await auth_service.forgot_password(db, payload.email, settings.FRONTEND_URL)
    return {"data": result, "error": None, "meta": {}}


@router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await auth_service.reset_password(db, payload.token, payload.password)
    return {"data": result, "error": None, "meta": {}}


@router.post("/google")
@limiter.limit("10/minute")
async def google_auth(
    request: Request,
    payload: GoogleAuthRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    result = await auth_service.google_auth(db, payload.access_token)
    _set_refresh(response, result)
    return {"data": result, "error": None, "meta": {}}