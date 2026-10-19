from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.help_event import HelpEvent
from app.schemas.help import HelpEntry, HelpEventCreate
from app.services.help_registry import build_help
from app.services.matrix_config import get_config as get_matrix_config

HELP_EVENT_RETENTION_DAYS = 180


async def get_entries(db: AsyncSession, tenant_id: UUID) -> list[HelpEntry]:
    return build_help(await get_matrix_config(db, tenant_id))


async def log_event(db: AsyncSession, tenant_id: UUID, account_id: UUID, payload: HelpEventCreate) -> None:
    db.add(HelpEvent(
        tenant_id=tenant_id, account_id=account_id,
        event=payload.event, entry_id=payload.entry_id, query=payload.query,
    ))
    await db.flush()