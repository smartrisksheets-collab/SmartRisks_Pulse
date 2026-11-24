"""
Gap map batch 7: the nightly purge clears short-lived tables, and Alembic
sees every model.
"""

import uuid

import pytest
from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.scheduler.jobs import purge_housekeeping_tables


async def _count(sql: str, params: dict) -> int:
    async with AsyncSessionLocal() as s:
        return int(await s.scalar(text(sql), params))


@pytest.mark.asyncio
async def test_purge_removes_only_old_rows(seed: dict) -> None:
    tag = uuid.uuid4().hex[:8]
    async with AsyncSessionLocal() as s:
        for age in ("40 days", "1 day"):
            await s.execute(text(
                "INSERT INTO api_error_log (id, method, path, status_code, created_at) "
                f"VALUES (gen_random_uuid(), 'GET', :e, 500, now() - interval '{age}')"), {"e": f"/t/{tag}"})
        for key, age in ((f"old:{tag}", "3 days"), (f"new:{tag}", "1 hour")):
            await s.execute(text(
                "INSERT INTO rate_limit_counters (key, window_start, count, updated_at) "
                f"VALUES (:k, now() - interval '{age}', 1, now())"), {"k": key})
        for jti, exp in ((f"old-{tag}", "now() - interval '1 hour'"), (f"new-{tag}", "now() + interval '1 day'")):
            await s.execute(text(
                "INSERT INTO revoked_refresh_tokens (jti, account_id, reason, expires_at) "
                f"VALUES (:j, :a, 'used', {exp})"), {"j": jti, "a": seed["account_id"]})
        for job, age in ((f"old-{tag}", "8 days"), (f"new-{tag}", "1 day")):
            await s.execute(text(
                "INSERT INTO scheduler_runs (job_id, slot, claimed_at) "
                f"VALUES (:j, date_trunc('minute', now()), now() - interval '{age}')"), {"j": job})
        await s.commit()

    removed = await purge_housekeeping_tables()
    assert set(removed) == {"api_error_log", "rate_limit_counters", "revoked_refresh_tokens", "scheduler_runs"}

    assert await _count("SELECT count(*) FROM api_error_log WHERE path = :e", {"e": f"/t/{tag}"}) == 1
    assert await _count("SELECT count(*) FROM rate_limit_counters WHERE key LIKE :k", {"k": f"%:{tag}"}) == 1
    assert await _count("SELECT count(*) FROM revoked_refresh_tokens WHERE jti LIKE :k", {"k": f"%-{tag}"}) == 1
    assert await _count("SELECT count(*) FROM scheduler_runs WHERE job_id LIKE :k", {"k": f"%-{tag}"}) == 1
    assert await _count("SELECT count(*) FROM rate_limit_counters WHERE key = :k", {"k": f"new:{tag}"}) == 1


def test_alembic_metadata_has_every_table() -> None:
    import app.models  # noqa: F401
    from app.db.base import Base
    for table in ("accounts", "tenants", "risks", "incidents", "account_identities", "help_events",
                  "workspace_matrix_config", "report_templates", "report_settings", "api_error_log"):
        assert table in Base.metadata.tables
