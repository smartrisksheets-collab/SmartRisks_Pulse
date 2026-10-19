from uuid import UUID
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_db, get_active_tenant
from app.core.rate_limit import limiter
from app.schemas.help import HelpEventCreate
from app.services import ask_pulse

router = APIRouter(prefix="/help", tags=["help"])


@router.get("")
async def get_help(
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_active_tenant),
) -> dict:
    entries = await ask_pulse.get_entries(db, UUID(claims["active_tenant_id"]))
    return {"data": [e.model_dump() for e in entries], "error": None, "meta": {"total": len(entries)}}


@router.post("/events")
@limiter.limit("60/minute")
async def log_help_event(
    request: Request,
    payload: HelpEventCreate,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(get_active_tenant),
) -> dict:
    await ask_pulse.log_event(db, UUID(claims["active_tenant_id"]), UUID(claims["sub"]), payload)
    return {"data": {"ok": True}, "error": None, "meta": {}}