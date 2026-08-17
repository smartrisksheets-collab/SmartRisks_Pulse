from fastapi import APIRouter, Depends, Request
from app.core.rate_limit import limiter
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from app.core.dependencies import get_db, get_active_tenant, require_permission
from app.schemas.user import (
    AddMemberRequest,
    UpdateMemberRequest,
    WorkspaceMemberResponse,
)
from app.services import user as user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
async def list_users(
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_active_tenant),
):
    tenant_id = UUID(claims["active_tenant_id"])
    rows = await user_service.list_members(db, tenant_id)
    data = [
        {
            "id":           str(m.id),
            "account_id":   str(m.account_id),
            "email":        a.email,
            "name":         a.name,
            "role":         m.role,
            "status":       m.status,
            "permissions":  m.permissions,
            "last_login":   a.last_login.isoformat() if a.last_login else None,
        }
        for m, a in rows
    ]
    return {"data": data, "error": None, "meta": {"total": len(data)}}


@router.post("")
@limiter.limit("10/minute")
async def add_user(
    request: Request,
    payload: AddMemberRequest,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(require_permission("manage_users")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    member = await user_service.add_member(db, tenant_id, payload, claims["email"])
    return {"data": {"id": str(member.id)}, "error": None, "meta": {}}


@router.patch("/{member_id}")
@limiter.limit("60/minute")
async def update_user(
    request: Request,
    member_id: UUID,
    payload: UpdateMemberRequest,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(require_permission("manage_users")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    member = await user_service.update_member(
        db, tenant_id, member_id, payload, claims["email"]
    )
    return {"data": {"id": str(member.id)}, "error": None, "meta": {}}


@router.delete("/{member_id}")
@limiter.limit("60/minute")
async def deactivate_user(
    request: Request,
    member_id: UUID,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(require_permission("manage_users")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    await user_service.deactivate_member(db, tenant_id, member_id, claims["email"])
    return {"data": {"message": "Member deactivated"}, "error": None, "meta": {}}


@router.delete("/{member_id}/remove")
@limiter.limit("60/minute")
async def remove_user(
    request: Request,
    member_id: UUID,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(require_permission("manage_users")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    await user_service.remove_member(db, tenant_id, member_id, claims["email"])
    return {"data": {"message": "Member removed"}, "error": None, "meta": {}}


@router.post("/{member_id}/reactivate")
@limiter.limit("60/minute")
async def reactivate_user(
    request: Request,
    member_id: UUID,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(require_permission("manage_users")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    member = await user_service.reactivate_member(
        db, tenant_id, member_id, claims["email"]
    )
    return {"data": {"id": str(member.id)}, "error": None, "meta": {}}