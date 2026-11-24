"""Clash-free record numbers per workspace.

Numbers used to be the highest existing one plus 1, so two saves at the same
moment got the same number, and deleting the newest record let its number be
reused (a restore then clashed). The counter row is updated in one atomic
statement: the second of two saves waits for the first and gets the next
number. The seed is the highest number already in use, so ids written by
other paths (restore, data loads) are never handed out again.
"""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def next_number(db: AsyncSession, tenant_id: UUID, scope: str, seed: int) -> int:
    """The next number for (workspace, scope). seed is the highest number in use."""
    value = await db.scalar(
        text("""
            INSERT INTO id_counters (tenant_id, scope, last_value)
            VALUES (CAST(:t AS uuid), :scope, :seed + 1)
            ON CONFLICT (tenant_id, scope) DO UPDATE SET
              last_value = GREATEST(id_counters.last_value, :seed) + 1,
              updated_at = now()
            RETURNING last_value
        """),
        {"t": str(tenant_id), "scope": scope, "seed": seed},
    )
    return int(value)
