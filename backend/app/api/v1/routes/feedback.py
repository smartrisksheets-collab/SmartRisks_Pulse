from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_db, get_active_tenant
from app.schemas.feedback import FeedbackCreate
from app.services import feedback as feedback_svc

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("")
async def submit_feedback(
    payload: FeedbackCreate,
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await feedback_svc.save_feedback(
        db=db,
        tenant_id=UUID(claims["active_tenant_id"]),
        account_id=UUID(claims["sub"]),
        email=str(claims["email"]),
        event_key=payload.event_key,
        rating=payload.rating,
        comment=payload.comment,
    )
    return {"data": {"ok": True}, "error": None, "meta": {}}