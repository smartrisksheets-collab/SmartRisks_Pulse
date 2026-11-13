"""
backend/tests/test_home.py

GET /api/v1/home (UI step 4): verdict, tiles, ranked actions, tagged lists,
setup flags and module handling. Each service test uses its own tenant.
"""

import os
import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.services.home import get_home


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
                :id, 'Home Test', 'Technology', 'TRIAL', CURRENT_DATE, false,
                1000, 25, ARRAY['risk','incident'], '$', :created_by, now(), now()
            )
        """),
        {"id": str(tid), "created_by": seed["account_id"]},
    )
    await s.execute(
        text("""
            INSERT INTO workspace_members (id, account_id, tenant_id, role, status, permissions, created_at, updated_at)
            VALUES (:id, :acc, :t, 'Owner', 'ACTIVE', '{}', now(), now())
        """),
        {"id": str(uuid.uuid4()), "acc": seed["account_id"], "t": str(tid)},
    )
    return tid


async def _populate(s: AsyncSession, tid: uuid.UUID) -> None:
    await s.execute(
        text("INSERT INTO appetite_thresholds (tenant_id, category, threshold) VALUES (:t, 'Operational', 8)"),
        {"t": str(tid)},
    )
    risks = [
        ("R-1", "Vendor data leak", "Operational", "Ada Obi", 12, True, date.today() + timedelta(days=5)),
        ("R-2", "Branch cash errors", "Operational", "Tunde A.", 5, False, None),
        ("R-3", "Key staff loss", "People", "HR Lead", 9, False, None),
        ("R-4", "Unscored idea", "People", "HR Lead", None, False, None),
    ]
    for rid, desc, cat, owner, res, elev, due in risks:
        await s.execute(
            text("""
                INSERT INTO risks (id, tenant_id, description, category, owner, residual, is_elevated, target_date)
                VALUES (:id, :t, :d, :c, :o, :r, :e, :due)
            """),
            {"id": rid, "t": str(tid), "d": desc, "c": cat, "o": owner, "r": res, "e": elev, "due": due},
        )
    today = date.today()
    incidents = [
        ("INC-1", "Phishing email", "Cyber", "High", "New", today - timedelta(days=1), None),
        ("INC-2", "Till shortage", "Operational", "Low", "In Progress", today - timedelta(days=3), "R-2"),
        ("INC-3", "Old outage", "Operational", "Medium", "Resolved", today - timedelta(days=40), "R-2"),
    ]
    for iid, title, cat, sev, status, rep, link in incidents:
        await s.execute(
            text("""
                INSERT INTO incidents (id, tenant_id, title, category, severity, status, reported_at, linked_risk_id)
                VALUES (:id, :t, :ti, :c, :sev, :st, :rep, :link)
            """),
            {"id": iid, "t": str(tid), "ti": title, "c": cat, "sev": sev, "st": status, "rep": rep, "link": link},
        )
    await s.commit()


@pytest.mark.asyncio
async def test_home_full_workspace(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await _populate(session, tid)
    home = await get_home(session, tid, uuid.UUID(seed["account_id"]), ["risk", "incident"])

    assert home.first_name == "Test"
    assert home.workspace == "Home Test"
    assert home.verdict.startswith(f"Home Test is {home.status}.")
    assert "1 risk sits outside appetite" in home.verdict
    assert "a high-severity incident has no matching risk" in home.verdict
    assert home.focus is not None and home.focus.id == "R-1"
    assert home.verdict.endswith("Start with R-1.")

    assert home.tiles.outside_appetite.value == 1
    assert home.tiles.outside_appetite.note.startswith("R-1 Vendor data leak. Owner Ada Obi, due ")
    assert home.tiles.open_incidents.value == 2
    assert home.tiles.open_high == 1
    assert home.tiles.open_incidents.note == "1 has no matching risk on the register."

    assert home.actions[0].key == "appetite_breach"
    assert home.actions[0].target_kind == "risk"
    assert home.actions_total >= len(home.actions)
    assert home.tiles.open_actions.value == home.actions_total
    assert len({a.key for a in home.actions}) == len(home.actions)

    assert [r.id for r in home.top_risks] == ["R-1", "R-3", "R-2"]
    assert "Outside appetite" in home.top_risks[0].tags

    assert [i.id for i in home.open_incidents] == ["INC-1", "INC-2"]
    assert home.open_incidents[0].tags == ["Cyber: no risk line"]

    assert home.setup.first_run is False
    assert (home.setup.appetite, home.setup.risks, home.setup.incidents, home.setup.team) == (True, True, True, False)


@pytest.mark.asyncio
async def test_home_empty_workspace_is_first_run(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await session.commit()
    home = await get_home(session, tid, None, ["risk", "incident"])

    assert home.first_name is None
    assert home.setup.first_run is True
    assert (home.setup.appetite, home.setup.risks, home.setup.incidents, home.setup.team) == (False, False, False, False)
    assert home.actions == [] and home.top_risks == [] and home.open_incidents == []


@pytest.mark.asyncio
async def test_home_incident_only_workspace(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await _populate(session, tid)
    home = await get_home(session, tid, None, ["incident"])

    assert home.status == ""
    assert home.verdict.startswith("Home Test has 2 open incidents.")
    assert home.actions == [] and home.actions_total == 0
    assert home.top_risks == [] and home.activity_feed == []
    assert [i.id for i in home.open_incidents] == ["INC-1", "INC-2"]
    assert all("risk" not in t.lower() for i in home.open_incidents for t in i.tags)


@pytest.mark.asyncio
async def test_home_endpoint(client: AsyncClient, owner_headers: dict) -> None:
    r = await client.get("/api/v1/home", headers=owner_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    for key in ("verdict", "tiles", "actions", "top_risks", "open_incidents", "setup", "first_name"):
        assert key in data
