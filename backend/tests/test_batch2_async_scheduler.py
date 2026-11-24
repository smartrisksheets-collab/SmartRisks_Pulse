"""
Gap map batch 2: blocking work off the event loop, SLA alerts sent once,
and scheduled jobs running once across app copies.
"""

import asyncio
import threading
import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal

from app.scheduler.jobs import job_incident_escalation
from app.scheduler.single_run import claim, single_run, slot_for
from app.services import offload


# ── Item 5: off the event loop ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_run_in_background_returns_at_once_and_uses_a_thread() -> None:
    started = threading.Event()
    release = threading.Event()
    seen: dict[str, int] = {}

    def slow() -> None:
        seen["thread"] = threading.get_ident()
        started.set()
        release.wait(5)

    offload.run_in_background(slow)          # must not block the loop
    await asyncio.to_thread(started.wait, 5)
    assert seen["thread"] != threading.get_ident()
    release.set()
    await asyncio.gather(*list(offload._TASKS))
    assert not offload._TASKS                # reference dropped when done


@pytest.mark.asyncio
async def test_run_in_background_logs_failures_instead_of_raising() -> None:
    def boom() -> None:
        raise RuntimeError("resend down")

    with patch.object(offload.logger, "exception") as log:
        offload.run_in_background(boom)
        await asyncio.gather(*list(offload._TASKS))
    log.assert_called_once()


@pytest.mark.asyncio
async def test_run_in_background_runs_inline_without_a_loop() -> None:
    """In a worker thread (BackgroundTasks, to_thread) errors still reach the caller."""
    def boom() -> None:
        raise RuntimeError("inline")

    with pytest.raises(RuntimeError, match="inline"):
        await asyncio.to_thread(offload.run_in_background, boom)


# ── Item 9: one run per slot ─────────────────────────────────────────────────

def test_slot_rounds_to_the_nearest_minute() -> None:
    a = datetime(2026, 11, 24, 7, 0, 29, tzinfo=timezone.utc)
    b = datetime(2026, 11, 24, 6, 59, 31, tzinfo=timezone.utc)
    assert slot_for(a) == slot_for(b) == datetime(2026, 11, 24, 7, 0, tzinfo=timezone.utc)


@pytest.mark.asyncio
async def test_two_copies_of_a_job_run_it_once(seed) -> None:
    calls: list[int] = []

    async def job() -> None:
        calls.append(1)

    wrapped = single_run(f"test-{uuid.uuid4().hex[:8]}", job)
    await asyncio.gather(wrapped(), wrapped())   # two app copies firing together
    assert calls == [1]


@pytest.mark.asyncio
async def test_claim_is_per_job_and_per_slot(seed) -> None:
    slot = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
    job = f"test-{uuid.uuid4().hex[:8]}"
    assert await claim(job, slot) is True
    assert await claim(job, slot) is False
    assert await claim(job + "-other", slot) is True
    assert await claim(job, datetime(2026, 1, 1, 0, 1, tzinfo=timezone.utc)) is True


# ── Item 8: SLA alert sent once ──────────────────────────────────────────────

async def _breached_incident(seed: dict) -> tuple[str, str]:
    async with AsyncSessionLocal() as s:
        return await _seed_breach(s, seed)


async def _escalated_at(tid: str, iid: str) -> datetime | None:
    async with AsyncSessionLocal() as s:
        return await s.scalar(
            text("SELECT escalated_at FROM incidents WHERE tenant_id = :t AND id = :id"), {"t": tid, "id": iid})


async def _seed_breach(s: AsyncSession, seed: dict) -> tuple[str, str]:
    tid = str(uuid.uuid4())
    await s.execute(
        text("""
            INSERT INTO tenants (id, name, industry, plan, trial_start_date, payment_active,
                max_risks, max_users, modules, currency_symbol, created_by, created_at, updated_at)
            VALUES (:id, 'SLA Test', 'Technology', 'TRIAL', CURRENT_DATE, false, 1000, 25,
                ARRAY['risk','incident'], '$', :cb, now(), now())
        """),
        {"id": tid, "cb": seed["account_id"]},
    )
    await s.execute(
        text("INSERT INTO workspace_members (id, account_id, tenant_id, role, status, permissions, created_at, updated_at) "
             "VALUES (gen_random_uuid(), :a, :t, 'Owner', 'ACTIVE', '{}', now(), now())"),
        {"a": seed["account_id"], "t": tid},
    )
    sev_id = await s.scalar(
        text("INSERT INTO incident_severity_levels (tenant_id, label, sort_order) VALUES (:t, 'Critical', 0) RETURNING id"),
        {"t": tid},
    )
    await s.execute(
        text("INSERT INTO incident_sla_targets (severity_id, target_value, target_unit, target_hours) "
             "VALUES (:s, 1, 'hours', 1)"),
        {"s": sev_id},
    )
    await s.execute(
        text("INSERT INTO incident_escalation_rules (tenant_id, auto_escalate_on_breach) VALUES (:t, true)"),
        {"t": tid},
    )
    iid = "INC-SLA-001"
    await s.execute(
        text("INSERT INTO incidents (id, tenant_id, title, category, severity, status, created_at) "
             "VALUES (:id, :t, 'Outage', 'IT', 'Critical', 'New', now() - interval '3 hours')"),
        {"id": iid, "t": tid},
    )
    await s.commit()
    return tid, iid


@pytest.mark.asyncio
async def test_escalation_alert_is_sent_once(seed: dict) -> None:
    tid, iid = await _breached_incident(seed)
    with patch("app.services.email.send_escalation_alert", return_value=True) as send:
        await job_incident_escalation()
        await job_incident_escalation()
    mine = [c for c in send.call_args_list if c.kwargs["incident_id"] == iid and c.kwargs["tenant_name"] == "SLA Test"]
    assert len(mine) == 1
    stamped = await _escalated_at(tid, iid)
    assert stamped is not None


@pytest.mark.asyncio
async def test_failed_escalation_is_retried_next_run(seed: dict) -> None:
    tid, iid = await _breached_incident(seed)
    with patch("app.services.email.send_escalation_alert", return_value=False):
        await job_incident_escalation()
    stamped = await _escalated_at(tid, iid)
    assert stamped is None
    with patch("app.services.email.send_escalation_alert", return_value=True) as send:
        await job_incident_escalation()
    assert any(c.kwargs["incident_id"] == iid for c in send.call_args_list)
