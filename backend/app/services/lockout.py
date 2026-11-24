"""Failed-attempt lockout for the workspace PIN (per member) and admin sign-in.

Every request runs in one transaction that get_db rolls back on any error.
A wrong PIN or password ends in an error, so a counter written in that
transaction would be undone every time. Failures are therefore written in
their own short session that commits before the caller raises.

The columns are read and written with SQL text, not the ORM models, so the
rest of the app keeps working on a database where migration 067 has not run.
"""

from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal

# Fixed table and column names only. Never built from user input.
_TARGETS: dict[str, tuple[str, str, str]] = {
    "member_pin":  ("workspace_members", "pin_attempts",          "pin_locked_until"),
    "admin_login": ("admin_accounts",    "failed_login_attempts", "locked_until"),
}


def minutes_left(seconds: int) -> int:
    """Whole minutes, rounded up, never below 1."""
    return max(1, (seconds + 59) // 60)


async def locked_seconds(db: AsyncSession, target: str, row_id: str) -> int:
    """Seconds left on an active lock, or 0 when the row is not locked."""
    table, _, locked_col = _TARGETS[target]
    locked_until = await db.scalar(
        text(f"SELECT {locked_col} FROM {table} WHERE id = CAST(:id AS uuid)"),
        {"id": row_id},
    )
    if locked_until is None:
        return 0
    left = int((locked_until - datetime.now(timezone.utc)).total_seconds())
    return left if left > 0 else 0


async def record_failure(target: str, row_id: str, max_attempts: int, lock_minutes: int) -> int:
    """Count one failure and commit it at once.

    Returns the attempts left before a lock, or 0 when this failure locked the
    row. The update is one atomic statement, so two failures arriving together
    are both counted. Reaching the limit sets the lock and resets the count.
    """
    table, attempts_col, locked_col = _TARGETS[target]
    async with AsyncSessionLocal() as session:
        attempts = await session.scalar(
            text(f"""
                UPDATE {table} SET
                  {attempts_col} = CASE WHEN {attempts_col} + 1 >= :max_attempts
                                        THEN 0 ELSE {attempts_col} + 1 END,
                  {locked_col}   = CASE WHEN {attempts_col} + 1 >= :max_attempts
                                        THEN now() + make_interval(mins => :lock_minutes)
                                        ELSE {locked_col} END
                WHERE id = CAST(:id AS uuid)
                RETURNING {attempts_col}
            """),
            {"id": row_id, "max_attempts": max_attempts, "lock_minutes": lock_minutes},
        )
        await session.commit()
    if attempts is None or int(attempts) == 0:
        return 0
    return max_attempts - int(attempts)


async def clear(db: AsyncSession, target: str, row_id: str) -> None:
    """Reset the count and lock after a success, inside the request transaction."""
    table, attempts_col, locked_col = _TARGETS[target]
    await db.execute(
        text(f"UPDATE {table} SET {attempts_col} = 0, {locked_col} = NULL WHERE id = CAST(:id AS uuid)"),
        {"id": row_id},
    )
