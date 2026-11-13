"""
backend/tests/test_dashboard_analytics.py

Analytics data added in UI step 3a:
  - incident stats: per-severity targets, cost list, category drivers
  - risk pressure: open High incidents and top owner by residual
  - movement points: health and pressure per month
  - monthly snapshot writer: stores health and pressure

Each test uses its own tenant, so rows from other test files cannot leak in.
"""

import os
import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.services.dashboard import _intel
from app.services.incident import get_stats
from app.services.snapshot import write_monthly_snapshot


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
                :id, 'Analytics Test', 'Technology', 'TRIAL', CURRENT_DATE, false,
                1000, 25, ARRAY['risk','incident'], '$', :created_by, now(), now()
            )
        """),
        {"id": str(tid), "created_by": seed["account_id"]},
    )
    return tid


async def _risk(s: AsyncSession, tid: uuid.UUID, rid: str, owner: str, residual: float, cat: str) -> None:
    await s.execute(
        text("""
            INSERT INTO risks (id, tenant_id, description, category, owner, residual)
            VALUES (:id, :t, 'Analytics test risk', :cat, :owner, :res)
        """),
        {"id": rid, "t": str(tid), "cat": cat, "owner": owner, "res": residual},
    )


async def _incident(
    s: AsyncSession, tid: uuid.UUID, iid: str, *, severity: str, status: str, category: str,
    reported: date, resolved: date | None = None, cost: float | None = None,
    confidence: str | None = None, linked: str | None = None,
) -> None:
    await s.execute(
        text("""
            INSERT INTO incidents (
                id, tenant_id, title, category, severity, status, reported_at,
                resolved_at, financial_impact, impact_confidence, linked_risk_id
            ) VALUES (
                :id, :t, :title, :cat, :sev, :status, :rep,
                :res, :cost, :conf, :link
            )
        """),
        {
            "id": iid, "t": str(tid), "title": f"{iid} title", "cat": category, "sev": severity,
            "status": status, "rep": reported, "res": resolved, "cost": cost,
            "conf": confidence, "link": linked,
        },
    )


async def _seed_register(s: AsyncSession, seed: dict) -> uuid.UUID:
    tid = await _tenant(s, seed)
    await _risk(s, tid, "R-1", "Ada", 10, "Operational")
    await _risk(s, tid, "R-2", "Ada", 5, "Operational")
    await _risk(s, tid, "R-3", "Bo", 12, "Financial")
    today = date.today()
    await _incident(s, tid, "INC-1", severity="High", status="New", category="Cyber",
                    reported=today - timedelta(days=1), cost=4200000, confidence="Low confidence")
    await _incident(s, tid, "INC-2", severity="Medium", status="Resolved", category="Operational",
                    reported=date(2026, 10, 1), resolved=date(2026, 10, 3), cost=100,
                    confidence="Confirmed", linked="R-1")
    await _incident(s, tid, "INC-3", severity="Medium", status="Resolved", category="Operational",
                    reported=date(2026, 10, 1), resolved=date(2026, 10, 11))
    await _incident(s, tid, "INC-4", severity="Low", status="In Progress", category="Operational",
                    reported=today - timedelta(days=2))
    await s.commit()
    return tid


@pytest.mark.asyncio
async def test_incident_stats_analytics_fields(session: AsyncSession, seed: dict) -> None:
    tid = await _seed_register(session, seed)
    stats = await get_stats(session, tid)

    sev = {row.severity: row for row in stats.by_severity}
    names = [row.severity for row in stats.by_severity]
    assert names.index("High") < names.index("Medium") < names.index("Low")
    assert (sev["High"].target_days, sev["High"].open, sev["High"].resolved) == (3, 1, 0)
    assert sev["High"].median_days is None
    # INC-2 took 2 days (met), INC-3 took 10 days against a 5 day target (missed).
    assert (sev["Medium"].target_days, sev["Medium"].resolved, sev["Medium"].met) == (5, 2, 1)
    assert sev["Medium"].median_days == 6.0
    assert (sev["Low"].target_days, sev["Low"].open) == (10, 1)

    assert [c.id for c in stats.costs] == ["INC-1", "INC-2"]
    assert stats.costs[0].confidence == "Low confidence"
    assert str(stats.costs[0].amount) == "4200000.00"

    cats = [(c.category, c.count, c.open, c.unlinked_ids) for c in stats.by_category]
    assert cats == [
        ("Operational", 3, 1, ["INC-3", "INC-4"]),
        ("Cyber", 1, 1, ["INC-1"]),
    ]


@pytest.mark.asyncio
async def test_pressure_extras_and_movement_scores(session: AsyncSession, seed: dict) -> None:
    tid = await _seed_register(session, seed)
    today = date.today()
    prev = date(today.year - 1, 12, 1) if today.month == 1 else date(today.year, today.month - 1, 1)
    await session.execute(
        text("""
            INSERT INTO snapshots_monthly (
                id, tenant_id, month_key, month_label, month_date, avg_residual,
                health_score, pressure_score
            ) VALUES (:id, :t, :k, :l, :d, 6.5, 61, 37)
        """),
        {"id": str(uuid.uuid4()), "t": str(tid), "k": prev.strftime("%Y-%m"),
         "l": prev.strftime("%b %Y"), "d": prev},
    )
    await session.commit()

    health, pressure, _, _, movement = await _intel(session, tid)

    assert pressure.open_high == 1
    assert pressure.top_owner == "Ada"
    assert pressure.top_owner_residual == 15.0
    assert pressure.top_owner_risks == 2

    points = {p.month_key: p for p in movement.points}
    past = points[prev.strftime("%Y-%m")]
    assert (past.health_score, past.pressure_score) == (61, 37)
    live = movement.points[-1]
    assert live.is_live
    assert live.health_score == health.score
    assert live.pressure_score == pressure.score


@pytest.mark.asyncio
async def test_monthly_snapshot_stores_scores(session: AsyncSession, seed: dict) -> None:
    tid = await _seed_register(session, seed)
    health, pressure, _, _, _ = await _intel(session, tid)

    snap = await write_monthly_snapshot(session, tid, target_month=date(2026, 9, 1))
    await session.commit()

    assert snap is not None
    assert snap.health_score == health.score
    assert snap.pressure_score == pressure.score


@pytest.mark.asyncio
async def test_monthly_snapshot_empty_workspace_leaves_scores_blank(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await session.commit()

    snap = await write_monthly_snapshot(session, tid, target_month=date(2026, 9, 1))
    await session.commit()

    assert snap is not None
    assert snap.health_score is None
    assert snap.pressure_score is None
