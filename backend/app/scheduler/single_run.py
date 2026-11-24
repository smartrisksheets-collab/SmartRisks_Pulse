"""Run each scheduled job slot once, however many app copies are running.

The scheduler starts inside every web process. With two processes, every job
would run twice (two briefs, two snapshots). Before a job runs, its copy
claims the slot (job id + minute) with an INSERT that only one copy can win.

A row claim works through Supabase's transaction pooler, where session
advisory locks do not, and it holds no connection while the job runs.
"""

import functools
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)


def slot_for(now: datetime) -> datetime:
    """The nearest whole minute, so copies a few seconds apart share a slot."""
    rounded = now + timedelta(seconds=30)
    return rounded.replace(second=0, microsecond=0)


async def claim(job_id: str, slot: datetime) -> bool:
    """True when this copy won the slot. When the claims table is missing
    (migration 068 not run yet) the job runs, as it did before."""
    try:
        async with AsyncSessionLocal() as session:
            won = await session.scalar(
                text("""
                    INSERT INTO scheduler_runs (job_id, slot) VALUES (:job_id, :slot)
                    ON CONFLICT (job_id, slot) DO NOTHING
                    RETURNING 1
                """),
                {"job_id": job_id, "slot": slot},
            )
            await session.commit()
    except Exception:
        logger.exception("scheduler claim failed, running job anyway | job=%s", job_id)
        return True
    return won is not None


def single_run(job_id: str, job: Callable[[], Awaitable[None]]) -> Callable[[], Awaitable[None]]:
    @functools.wraps(job)
    async def _wrapped() -> None:
        if not await claim(job_id, slot_for(datetime.now(timezone.utc))):
            logger.info("scheduler: %s already claimed by another copy", job_id)
            return
        await job()
    return _wrapped
