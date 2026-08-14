from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.dependencies import get_db, get_active_tenant

router = APIRouter(prefix="/presence", tags=["presence"])


@router.post("/heartbeat")
async def heartbeat(
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await db.execute(
        text("""
            INSERT INTO workspace_presence (tenant_id, account_id, email, last_seen)
            VALUES (:tenant_id, :account_id, :email, now())
            ON CONFLICT (tenant_id, account_id)
            DO UPDATE SET email = EXCLUDED.email, last_seen = now()
        """),
        {
            "tenant_id": claims["active_tenant_id"],
            "account_id": claims["sub"],
            "email": claims["email"],
        },
    )
    return {"data": None, "error": None, "meta": {}}


@router.get("/active")
async def get_active(
    claims: dict = Depends(get_active_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        text("""
            SELECT email FROM workspace_presence
            WHERE tenant_id = :tenant_id
              AND last_seen > now() - interval '5 minutes'
            ORDER BY last_seen DESC
        """),
        {"tenant_id": claims["active_tenant_id"]},
    )
    emails: list[str] = [str(row[0]) for row in result.fetchall()]
    return {"data": emails, "error": None, "meta": {}}