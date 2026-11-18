"""
backend/tests/test_lookup_owner_usage.py

Dept/Risk Owner is read by risks (owner) and incidents (assigned_to). Removing
an owner still on an active risk or incident is blocked in the service, and the
usage check reports both counts. Each test uses its own tenant so counts are exact.
"""

import os
import uuid
from datetime import date, datetime, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.exceptions import ValidationError
from app.models.incident import Incident
from app.schemas.incident import IncidentCreate
from app.schemas.lookup import LookupPatch
from app.schemas.risk import RiskCreate
from app.services import incident as inc_svc
from app.services import lookup as svc
from app.services import risk as risk_svc


@pytest_asyncio.fixture
async def session(seed):
    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


async def _tenant(s: AsyncSession, seed: dict) -> uuid.UUID:
    tid = uuid.uuid4()
    await s.execute(
        text("""
            INSERT INTO tenants (
                id, name, industry, plan, trial_start_date, payment_active,
                max_risks, max_users, modules, currency_symbol, created_by,
                created_at, updated_at
            ) VALUES (
                :id, 'Owner Usage Test', 'Technology', 'TRIAL', CURRENT_DATE, false,
                1000, 25, ARRAY['risk','incident'], '$', :created_by, now(), now()
            )
        """),
        {"id": str(tid), "created_by": seed["account_id"]},
    )
    return tid


def _inc(owner: str) -> IncidentCreate:
    return IncidentCreate(  # type: ignore[call-arg]
        description="Card terminal offline at the branch", category="Compliance",
        severity="Medium", reported_by="Tunde", reported_at=date.today(), assigned_to=owner,
    )


async def _setup(s: AsyncSession, seed: dict) -> uuid.UUID:
    """Owners: Ada (1 risk), Head Credit (2 incidents, 1 deleted), Unused (none)."""
    tid = await _tenant(s, seed)
    await svc.patch_lookups(s, tid, LookupPatch(risk_owner=["Ada", "Head Credit", "Unused"]))
    await risk_svc.create_risk(s, tid, RiskCreate(
        category="Compliance", description="Late filings", owner="Ada",
        treatment="Mitigate", likelihood=3, impact_score=3,
    ), "a@x.com")
    await inc_svc.create_incident(s, tid, _inc("Head Credit"), "a@x.com")
    gone = await inc_svc.create_incident(s, tid, _inc("Head Credit"), "a@x.com")
    await s.execute(
        update(Incident).where(Incident.id == gone.id).values(deleted_at=datetime.now(timezone.utc))
    )
    await s.commit()
    return tid


@pytest.mark.asyncio
async def test_owner_usage_counts_risks_and_active_incidents(session: AsyncSession, seed: dict) -> None:
    tid = await _setup(session, seed)
    assert await svc.lookup_usage(session, tid, "risk_owner", "Ada") == {"count": 1, "risks": 1, "incidents": 0}
    assert await svc.lookup_usage(session, tid, "risk_owner", "Head Credit") == {"count": 1, "risks": 0, "incidents": 1}
    assert await svc.lookup_usage(session, tid, "risk_owner", "Unused") == {"count": 0, "risks": 0, "incidents": 0}


@pytest.mark.asyncio
async def test_other_fields_keep_their_counts(session: AsyncSession, seed: dict) -> None:
    tid = await _setup(session, seed)
    assert await svc.lookup_usage(session, tid, "category", "Compliance") == {"count": 1, "risks": 1, "incidents": 0}
    assert await svc.lookup_usage(session, tid, "incident_category", "Compliance") == {"count": 1, "risks": 0, "incidents": 1}
    assert await svc.lookup_usage(session, tid, "business_unit", "Ops") == {"count": 0, "risks": 0, "incidents": 0}


@pytest.mark.asyncio
async def test_removing_owner_on_incident_is_blocked(session: AsyncSession, seed: dict) -> None:
    tid = await _setup(session, seed)
    with pytest.raises(ValidationError) as err:
        await svc.patch_lookups(session, tid, LookupPatch(risk_owner=["Ada", "Unused"]))
    assert "Head Credit (0 risks, 1 incidents)" in str(err.value)
    await session.rollback()
    with pytest.raises(ValidationError) as err:
        await svc.patch_lookups(session, tid, LookupPatch(risk_owner=["Unused"]))
    assert "Ada (1 risks, 0 incidents)" in str(err.value)
    await session.rollback()
    still = await svc.get_lookups(session, tid)
    assert still.risk_owner == ["Ada", "Head Credit", "Unused"]


@pytest.mark.asyncio
async def test_unused_owner_can_be_removed_and_other_lists_unaffected(session: AsyncSession, seed: dict) -> None:
    tid = await _setup(session, seed)
    out = await svc.patch_lookups(session, tid, LookupPatch(risk_owner=["Ada", "Head Credit"]))
    assert out.risk_owner == ["Ada", "Head Credit"]
    # A patch that leaves risk_owner out never runs the owner check.
    out = await svc.patch_lookups(session, tid, LookupPatch(treatment=["Mitigate", "Accept"]))
    assert out.risk_owner == ["Ada", "Head Credit"]
    await session.rollback()


@pytest.mark.asyncio
async def test_owner_block_is_per_tenant(session: AsyncSession, seed: dict) -> None:
    await _setup(session, seed)
    other = await _tenant(session, seed)
    await svc.patch_lookups(session, other, LookupPatch(risk_owner=["Head Credit"]))
    out = await svc.patch_lookups(session, other, LookupPatch(risk_owner=[]))
    assert out.risk_owner == []
    await session.rollback()


@pytest.mark.asyncio
async def test_usage_endpoint_returns_breakdown(client: AsyncClient, owner_headers: dict) -> None:
    r = await client.get(
        "/api/v1/lookups/usage", params={"field": "risk_owner", "value": "Nobody here"}, headers=owner_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["error"] is None
    assert body["data"] == {"field": "risk_owner", "value": "Nobody here", "count": 0, "risks": 0, "incidents": 0}
