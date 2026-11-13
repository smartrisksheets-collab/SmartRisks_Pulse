"""
backend/tests/test_risk_register_views.py

Risk Register rebuild (UI step 5): risk title, register statuses on each row,
quick-view filters and counts, residual sort, score preview and the side-panel
context. Service tests use their own tenant so counts are exact.
"""

import os
import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.exceptions import ResourceNotFoundError
from app.db.migration_sql import split_sql
from app.schemas.risk import RiskCreate, ScorePreviewRequest, display_title
from app.services import risk as svc


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
                :id, 'Register Test', 'Technology', 'TRIAL', CURRENT_DATE, false,
                1000, 25, ARRAY['risk','incident'], '$', :created_by, now(), now()
            )
        """),
        {"id": str(tid), "created_by": seed["account_id"]},
    )
    return tid


def _risk(**kw: object) -> RiskCreate:
    base: dict[str, object] = {
        "category": "Operational", "description": "A risk", "owner": "Ada Obi",
        "treatment": "Mitigate", "likelihood": 1, "impact_score": 1,
    }
    base.update(kw)
    return RiskCreate(**base)  # type: ignore[arg-type]


async def _populate(s: AsyncSession, tid: uuid.UUID) -> None:
    """R-001 exceeds appetite and is elevated, R-002 past target, R-003 low and decided, R-004 no threshold."""
    await s.execute(
        text("INSERT INTO appetite_thresholds (tenant_id, category, threshold) VALUES (:t, 'Operational', 8)"),
        {"t": str(tid)},
    )
    past = date.today() - timedelta(days=3)
    await svc.create_risk(s, tid, _risk(title="Vendor data leak", likelihood=5, impact_score=5,
                                        primary_impact="Regulatory fine"), "a@x.com")
    await svc.create_risk(s, tid, _risk(description="Branch cash errors", likelihood=2, impact_score=2,
                                        target_date=past), "a@x.com")
    await svc.create_risk(s, tid, _risk(description="Low and decided", linked_decision="Board Q1",
                                        target_date=past, mitigation_status="Closed"), "a@x.com")
    await svc.create_risk(s, tid, _risk(category="People", description="Key staff loss",
                                        likelihood=2, impact_score=3), "a@x.com")
    await s.commit()


# ── Pure helpers ─────────────────────────────────────────────────────────────

def test_display_title_prefers_title_then_description_then_id() -> None:
    assert display_title("  Vendor leak ", "long text", "R-001") == "Vendor leak"
    assert display_title(None, "Short   description", "R-002") == "Short description"
    long = "word " * 40
    out = display_title("", long, "R-003")
    assert len(out) <= 80 and out.endswith("…") and not out.startswith(" ")
    assert display_title(None, None, "R-004") == "R-004"


def test_title_validation() -> None:
    assert _risk(title="   ").title is None
    with pytest.raises(ValidationError):
        _risk(title="x" * 81)


def test_split_sql_ignores_transaction_words_comments_and_dollar_bodies() -> None:
    sql = """
        -- comment; with a semicolon
        BEGIN;
        ALTER TABLE risks ADD COLUMN IF NOT EXISTS title TEXT;
        DO $$ BEGIN PERFORM 1; END $$;
        INSERT INTO t VALUES ('a;b');
        COMMIT;
    """
    assert split_sql(sql) == [
        "ALTER TABLE risks ADD COLUMN IF NOT EXISTS title TEXT",
        "DO $$ BEGIN PERFORM 1; END $$",
        "INSERT INTO t VALUES ('a;b')",
    ]


# ── Service ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_statuses_and_residual_sort(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await _populate(session, tid)
    res = await svc.list_risks(session, tid, sort="residual")
    ids = [r.id for r in res.items]
    assert ids[0] == "R-001"
    residuals = [r.residual for r in res.items]
    assert residuals == sorted(residuals, reverse=True)

    by_id = {r.id: r for r in res.items}
    assert by_id["R-001"].title == "Vendor data leak"
    assert by_id["R-001"].display_title == "Vendor data leak"
    assert by_id["R-002"].display_title == "Branch cash errors"
    assert by_id["R-001"].appetite_status == "exceeds"
    assert by_id["R-001"].is_undecided is True
    assert by_id["R-002"].is_past_target is True
    assert by_id["R-003"].is_past_target is False  # closed, so not past target
    assert by_id["R-003"].is_undecided is False
    assert by_id["R-004"].appetite_status is None


@pytest.mark.asyncio
async def test_quick_view_filters_match_counts(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await _populate(session, tid)
    counts = await svc.get_view_counts(session, tid)
    assert counts.all == 4
    assert counts.exceeds == 1
    assert counts.past_target == 1
    assert counts.residual_max == 25
    assert counts.elevated_label
    assert counts.avg_residual is not None

    for flag, n in (("elevated", counts.elevated), ("past_target", counts.past_target),
                    ("undecided", counts.undecided)):
        res = await svc.list_risks(session, tid, **{flag: True})
        assert res.total == n, flag
    assert (await svc.list_risks(session, tid, appetite="Exceeds")).total == counts.exceeds

    narrowed = await svc.get_view_counts(session, tid, category="People")
    assert narrowed.all == 1 and narrowed.exceeds == 0


@pytest.mark.asyncio
async def test_search_covers_id_title_and_impact(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await _populate(session, tid)
    assert [r.id for r in (await svc.list_risks(session, tid, search="vendor data")).items] == ["R-001"]
    assert [r.id for r in (await svc.list_risks(session, tid, search="regulatory")).items] == ["R-001"]
    assert [r.id for r in (await svc.list_risks(session, tid, search="r-004")).items] == ["R-004"]


@pytest.mark.asyncio
async def test_empty_workspace_counts(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await session.commit()
    counts = await svc.get_view_counts(session, tid)
    assert (counts.all, counts.exceeds, counts.elevated, counts.undecided, counts.past_target) == (0, 0, 0, 0, 0)
    assert counts.avg_residual is None


@pytest.mark.asyncio
async def test_score_preview_matches_saved_score(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await _populate(session, tid)
    saved = (await svc.list_risks(session, tid, risk_id="R-001")).items[0]
    p = await svc.score_preview(session, tid, ScorePreviewRequest(
        likelihood=5, impact_score=5, control_effectiveness=None, category="Operational"))
    assert p.residual == saved.residual and p.level == saved.level
    assert p.appetite_status == "exceeds" and p.threshold == 8
    assert p.note.startswith("Residual 25 is above the Operational threshold of 8")
    assert p.ce_label == "Not assessed" and p.ce_pct == 0

    with_controls = await svc.score_preview(session, tid, ScorePreviewRequest(
        likelihood=5, impact_score=5, control_effectiveness=4, category="People"))
    assert with_controls.ce_pct == 80 and with_controls.residual == 5.0
    assert with_controls.threshold is None and "No appetite threshold is set for People" in with_controls.note

    no_cat = await svc.score_preview(session, tid, ScorePreviewRequest(likelihood=1, impact_score=1))
    assert no_cat.note == "Choose a category to check this risk against appetite."


@pytest.mark.asyncio
async def test_context_history_incidents_and_isolation(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await _populate(session, tid)
    await session.execute(
        text("""
            INSERT INTO incidents (id, tenant_id, title, severity, status, reported_at, linked_risk_id)
            VALUES ('INC-1', :t, 'Payroll outage', 'High', 'New', CURRENT_DATE, 'R-001'),
                   ('INC-2', :t, 'Deleted one', 'Low', 'New', CURRENT_DATE, 'R-001')
        """),
        {"t": str(tid)},
    )
    await session.execute(
        text("UPDATE incidents SET deleted_at = now() WHERE tenant_id = :t AND id = 'INC-2'"), {"t": str(tid)},
    )
    await session.commit()

    ctx = await svc.get_risk_context(session, tid, "R-001", include_incidents=True)
    assert ctx.score.appetite_status == "exceeds"
    assert [i.id for i in ctx.incidents] == ["INC-1"]
    assert ctx.history and ctx.history[0].action == "CREATE"

    hidden = await svc.get_risk_context(session, tid, "R-001", include_incidents=False)
    assert hidden.incidents == []

    other = await _tenant(session, seed)
    await session.commit()
    with pytest.raises(ResourceNotFoundError):
        await svc.get_risk_context(session, other, "R-001", include_incidents=True)
    assert (await svc.get_view_counts(session, other)).all == 0


@pytest.mark.asyncio
async def test_title_update_and_clear(session: AsyncSession, seed: dict) -> None:
    from app.schemas.risk import RiskUpdate
    tid = await _tenant(session, seed)
    await _populate(session, tid)
    upd = await svc.update_risk(session, tid, "R-002", RiskUpdate(title="Cash errors"), "a@x.com")
    assert upd.title == "Cash errors"
    cleared = await svc.update_risk(session, tid, "R-002", RiskUpdate(title=""), "a@x.com")
    assert cleared.title is None and cleared.display_title == "Branch cash errors"
    await session.commit()


# ── API ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_endpoints(client: AsyncClient, owner_headers: dict, analyst_headers: dict) -> None:
    r = await client.post("/api/v1/risks", headers=owner_headers, json={
        "title": "API titled risk", "category": "Operational", "description": "Made through the API",
        "owner": "Test Owner", "treatment": "Mitigate", "likelihood": 2, "impact_score": 2,
    })
    assert r.status_code == 200, r.text
    created = r.json()["data"]
    assert created["title"] == "API titled risk" and created["display_title"] == "API titled risk"

    r = await client.get("/api/v1/risks", headers=owner_headers, params={"sort": "residual", "elevated": "false"})
    assert r.status_code == 200
    assert (await client.get("/api/v1/risks", headers=owner_headers, params={"sort": "bogus"})).status_code == 422

    r = await client.get("/api/v1/risks/views", headers=analyst_headers)
    assert r.status_code == 200 and r.json()["data"]["all"] >= 1

    r = await client.get(f"/api/v1/risks/{created['id']}/context", headers=analyst_headers)
    assert r.status_code == 200 and "score" in r.json()["data"]
    r = await client.get("/api/v1/risks/R-999/context", headers=owner_headers)
    assert r.status_code == 404 and r.json()["error"] == "Risk R-999 not found"

    r = await client.post("/api/v1/risks/score-preview", headers=owner_headers,
                          json={"likelihood": 3, "impact_score": 3, "control_effectiveness": 2})
    assert r.status_code == 200 and r.json()["data"]["severity"] == 9

    r = await client.post("/api/v1/risks", headers=owner_headers, json={
        "title": "x" * 81, "category": "Operational", "description": "Too long title",
        "owner": "Test Owner", "treatment": "Mitigate", "likelihood": 2, "impact_score": 2,
    })
    assert r.status_code == 422
