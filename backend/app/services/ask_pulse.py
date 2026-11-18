from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.help_event import HelpEvent
from app.schemas.help import HelpEntry, HelpEventCreate
from app.services.help_registry import build_help
from app.services.matrix_config import get_config as get_matrix_config

HELP_EVENT_RETENTION_DAYS = 180


async def get_entries(
    db: AsyncSession, tenant_id: UUID, modules: list[str] | None = None,
) -> list[HelpEntry]:
    """Help entries for this workspace. Entries for a module the plan lacks are left out."""
    return for_modules(build_help(await get_matrix_config(db, tenant_id)), modules)


def for_modules(entries: list[HelpEntry], modules: list[str] | None) -> list[HelpEntry]:
    """Drop entries for modules the plan lacks. No module list means no filtering."""
    if modules is None:
        return entries
    enabled = set(modules)
    return [e for e in entries if e.module is None or e.module in enabled]


async def log_event(db: AsyncSession, tenant_id: UUID, account_id: UUID, payload: HelpEventCreate) -> None:
    db.add(HelpEvent(
        tenant_id=tenant_id, account_id=account_id,
        event=payload.event, entry_id=payload.entry_id, query=payload.query,
    ))
    await db.flush()

# ── Content backlog: questions help could not answer ──────────────────────────

GAP_EVENTS: tuple[str, ...] = ("no_results", "contact")
GAP_REPORT_LIMIT = 25


@dataclass(frozen=True)
class HelpGap:
    query:      str
    searches:   int   # searches that found nothing
    emailed:    int   # times someone emailed support about it
    workspaces: int   # distinct workspaces that asked


def _normalise(query: str | None) -> str:
    return " ".join((query or "").lower().split())


def summarise_gaps(rows: Iterable[tuple[str, str | None, Any]], limit: int = GAP_REPORT_LIMIT) -> list[HelpGap]:
    """Group (event, query, tenant_id) rows into the most-asked unanswered questions."""
    searches: dict[str, int] = {}
    emailed: dict[str, int] = {}
    tenants: dict[str, set[Any]] = {}
    for event, query, tenant_id in rows:
        q = _normalise(query)
        if not q or event not in GAP_EVENTS:
            continue
        bucket = searches if event == "no_results" else emailed
        bucket[q] = bucket.get(q, 0) + 1
        tenants.setdefault(q, set()).add(tenant_id)
    gaps = [
        HelpGap(query=q, searches=searches.get(q, 0), emailed=emailed.get(q, 0), workspaces=len(t))
        for q, t in tenants.items()
    ]
    gaps.sort(key=lambda g: (-(g.searches + g.emailed), -g.workspaces, g.query))
    return gaps[:limit]


async def unanswered_questions(db: AsyncSession, days: int) -> list[HelpGap]:
    """Across all workspaces, the questions Ask Pulse could not answer in the last `days` days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (await db.execute(
        select(HelpEvent.event, HelpEvent.query, HelpEvent.tenant_id)
        .where(HelpEvent.event.in_(GAP_EVENTS), HelpEvent.created_at >= since)
    )).all()
    return summarise_gaps((r[0], r[1], r[2]) for r in rows)
