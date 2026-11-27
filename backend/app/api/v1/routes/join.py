# app/api/v1/routes/join.py
"""Join by email domain.

Newcomer (signed in, no workspace needed): GET /join/workspaces,
POST /join/workspaces/{tenant_id}.
Admin (Manage Settings): GET and PUT /join/domain, GET /join/requests,
POST /join/requests/{id}/approve and /decline.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_account, get_db, require_permission
from app.core.rate_limit import limiter
from app.schemas.join import JoinApprove, JoinDomainUpdate
from app.services import join as join_svc

router = APIRouter(prefix="/join", tags=["join"])

_ADMIN = require_permission("manage_settings")


def _ok(data: object) -> dict:
    return {"data": data, "error": None, "meta": {}}


@router.get("/workspaces", response_model=dict)
@limiter.limit("30/minute")
async def list_joinable(
    request: Request,
    claims: dict = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = await join_svc.joinable_workspaces(db, UUID(claims["sub"]), str(claims.get("email", "")))
    return _ok([r.model_dump() for r in rows])


@router.post("/workspaces/{tenant_id}", response_model=dict)
@limiter.limit("10/minute")
async def ask_to_join(
    request: Request,
    tenant_id: UUID,
    claims: dict = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> dict:
    ws = await join_svc.request_to_join(db, UUID(claims["sub"]), str(claims.get("email", "")), tenant_id)
    return _ok(ws.model_dump())


@router.get("/domain", response_model=dict)
@limiter.limit("60/minute")
async def get_domain(
    request: Request,
    claims: dict = Depends(_ADMIN),
    db: AsyncSession = Depends(get_db),
) -> dict:
    s = await join_svc.get_setting(db, UUID(claims["active_tenant_id"]), str(claims.get("email", "")))
    return _ok(s.model_dump())


@router.put("/domain", response_model=dict)
@limiter.limit("10/minute")
async def set_domain(
    request: Request,
    payload: JoinDomainUpdate,
    claims: dict = Depends(_ADMIN),
    db: AsyncSession = Depends(get_db),
) -> dict:
    s = await join_svc.set_setting(
        db, UUID(claims["active_tenant_id"]), str(claims.get("email", "")), payload.enabled,
    )
    return _ok(s.model_dump())


@router.get("/requests", response_model=dict)
@limiter.limit("60/minute")
async def list_requests(
    request: Request,
    claims: dict = Depends(_ADMIN),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = await join_svc.pending_requests(db, UUID(claims["active_tenant_id"]))
    return _ok([r.model_dump(mode="json") for r in rows])


@router.post("/requests/{request_id}/approve", response_model=dict)
@limiter.limit("30/minute")
async def approve_request(
    request: Request,
    request_id: UUID,
    payload: JoinApprove | None = None,
    claims: dict = Depends(_ADMIN),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await join_svc.approve(
        db, UUID(claims["active_tenant_id"]), request_id, str(claims.get("email", "")),
        payload.role if payload else None,
    )
    return _ok({"approved": True})


@router.post("/requests/{request_id}/decline", response_model=dict)
@limiter.limit("30/minute")
async def decline_request(
    request: Request,
    request_id: UUID,
    claims: dict = Depends(_ADMIN),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await join_svc.decline(db, UUID(claims["active_tenant_id"]), request_id, str(claims.get("email", "")))
    return _ok({"declined": True})
