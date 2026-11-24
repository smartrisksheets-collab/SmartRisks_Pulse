"""
Gap map batch 4: risk, incident and submission numbers never clash, even when
two people save at the same moment, and a deleted record's number is not
handed out again.
"""

import asyncio
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.services import incident as incident_svc
from app.services import risk as risk_svc
from app.services import submission as sub_svc


async def _workspace(seed: dict) -> uuid.UUID:
    tid = uuid.uuid4()
    async with AsyncSessionLocal() as s:
        await s.execute(
            text("""
                INSERT INTO tenants (id, name, industry, plan, trial_start_date, payment_active,
                    max_risks, max_users, modules, currency_symbol, created_by, created_at, updated_at)
                VALUES (:id, 'ID Test', 'Technology', 'TRIAL', CURRENT_DATE, false, 1000, 25,
                    ARRAY['risk','incident'], '$', :cb, now(), now())
            """),
            {"id": str(tid), "cb": seed["account_id"]},
        )
        await s.commit()
    return tid


async def _take(fn, tid: uuid.UUID) -> str:
    """One save in its own transaction, as two users' requests would be."""
    async with AsyncSessionLocal() as s:
        value = await fn(s, tid)
        await asyncio.sleep(0.05)  # hold the transaction open, like a request still writing
        await s.commit()
        return value


@pytest.mark.asyncio
async def test_two_risks_saved_at_once_get_different_ids(seed: dict) -> None:
    tid = await _workspace(seed)
    ids = await asyncio.gather(*[_take(risk_svc._next_id, tid) for _ in range(5)])
    assert sorted(ids) == ["R-001", "R-002", "R-003", "R-004", "R-005"]


@pytest.mark.asyncio
async def test_risk_ids_continue_from_existing_and_are_not_reused(seed: dict) -> None:
    tid = await _workspace(seed)
    async with AsyncSessionLocal() as s:
        await s.execute(
            text("INSERT INTO risks (id, tenant_id, category, description) VALUES ('R-007', :t, 'IT', 'Old risk')"),
            {"t": str(tid)},
        )
        await s.commit()
    assert await _take(risk_svc._next_id, tid) == "R-008"
    # R-008 is never saved (deleted or rolled back); its number is not reused.
    assert await _take(risk_svc._next_id, tid) == "R-009"


@pytest.mark.asyncio
async def test_incident_ids_are_unique_per_year_under_load(seed: dict) -> None:
    tid = await _workspace(seed)
    year = datetime.now(timezone.utc).strftime("%Y")
    async with AsyncSessionLocal() as s:
        await s.execute(
            text("INSERT INTO incidents (id, tenant_id, title) VALUES (:id, :t, 'Old')"),
            {"id": f"INC-{year}-041", "t": str(tid)},
        )
        await s.execute(
            text("INSERT INTO incidents (id, tenant_id, title) VALUES ('INC-2001-900', :t, 'Other year')"),
            {"t": str(tid)},
        )
        await s.commit()
    ids = await asyncio.gather(*[_take(incident_svc._generate_id, tid) for _ in range(3)])
    assert sorted(ids) == [f"INC-{year}-042", f"INC-{year}-043", f"INC-{year}-044"]


@pytest.mark.asyncio
async def test_submission_references_are_unique_and_continue_the_sequence(seed: dict) -> None:
    tid = await _workspace(seed)
    async with AsyncSessionLocal() as s:
        for ref in ("SUB-2025-0001", "SUB-2025-0002", "SUB-2026-0005"):
            await s.execute(
                text("""
                    INSERT INTO risk_submissions (workspace_id, token_id, reference, submitter_name,
                        submitter_email, department, description)
                    VALUES (:w, gen_random_uuid(), :r, 'A', 'a@example.com', 'Ops', 'x')
                """),
                {"w": str(tid), "r": ref},
            )
        await s.commit()
    refs = await asyncio.gather(*[_take(sub_svc._generate_reference, tid) for _ in range(3)])
    year = datetime.now(timezone.utc).strftime("%Y")
    assert sorted(refs) == [f"SUB-{year}-0006", f"SUB-{year}-0007", f"SUB-{year}-0008"]


@pytest.mark.asyncio
async def test_duplicate_submission_reference_is_refused(seed: dict) -> None:
    tid = await _workspace(seed)
    insert = text("""
        INSERT INTO risk_submissions (workspace_id, token_id, reference, submitter_name,
            submitter_email, department, description)
        VALUES (:w, gen_random_uuid(), 'SUB-2026-0001', 'A', 'a@example.com', 'Ops', 'x')
    """)
    async with AsyncSessionLocal() as s:
        await s.execute(insert, {"w": str(tid)})
        await s.commit()
    from sqlalchemy.exc import IntegrityError
    async with AsyncSessionLocal() as s:
        with pytest.raises(IntegrityError):
            await s.execute(insert, {"w": str(tid)})
        await s.rollback()


@pytest.mark.asyncio
async def test_pending_list_index_exists(seed: dict) -> None:
    async with AsyncSessionLocal() as s:
        found = await s.scalar(text(
            "SELECT 1 FROM pg_indexes WHERE indexname = 'idx_external_submissions_tenant_status'"))
    assert found == 1
