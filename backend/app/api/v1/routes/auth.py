from uuid import UUID

from fastapi import APIRouter, Depends, Response, Cookie, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_db, get_current_account
from app.core.rate_limit import limiter
from app.core.config import settings
from app.core.security import decode_token
from app.schemas.auth import (
    LoginRequest, RegisterRequest, WorkspaceSelectRequest,
    PINVerifyRequest, AcceptInviteRequest,
    ForgotPasswordRequest, ResetPasswordRequest, GoogleAuthRequest,
)
from app.services import auth as auth_service
from app.services import invite as invite_service
from app.services import refresh_tokens

router = APIRouter(prefix="/auth", tags=["auth"])

_COOKIE_OPTS = dict(
    httponly=True,
    secure=True,
    samesite="none",
    path="/",
    max_age=60 * 60 * 24 * 7,
)


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


def _clear_refresh(response: Response) -> None:
    response.delete_cookie("refresh_token", path="/", secure=True, httponly=True, samesite="none")


@router.post("/logout")
@limiter.limit("30/minute")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    refresh_token: str | None = Cookie(default=None),
):
    """Ends this session: the refresh cookie is cleared and can no longer be used."""
    claims = decode_token(refresh_token or "")
    if claims.get("type") == "refresh" and claims.get("sub"):
        await refresh_tokens.revoke(db, claims, refresh_token or "", "logout")
    _clear_refresh(response)
    return {"data": {"message": "Logged out"}, "error": None, "meta": {}}


@router.post("/logout-all")
@limiter.limit("10/minute")
async def logout_all(
    request: Request,
    response: Response,
    claims: dict = Depends(get_current_account),
):
    """Ends every session of this account on every device. Access tokens already
    issued stop working when they expire (at most 15 minutes)."""
    await refresh_tokens.end_all_sessions(UUID(str(claims["sub"])))
    _clear_refresh(response)
    return {"data": {"message": "Logged out on all devices"}, "error": None, "meta": {}}


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
    result = await auth_service.forgot_password(db, payload.email, settings.allowed_origins[0])
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