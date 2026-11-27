"""
backend/tests/test_onboarding.py

Setup wizard (migration 073): options, the account's draft, finish creating
the workspace, categories and appetite in one go, and the 30-day draft purge.
Each test uses its own account.
"""

import os
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.exceptions import ResourceNotFoundError, ValidationError, WorkspaceLimitError
from app.core.security import create_access_token
from app.schemas.onboarding import OnboardingData, OnboardingDraftSave
from app.scheduler.jobs import purge_housekeeping_tables
from app.services import onboarding as svc


@pytest_asyncio.fixture
async def session(seed):
    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


async def _account(s: AsyncSession, max_workspaces: int = 1) -> tuple[uuid.UUID, str]:
    acc = uuid.uuid4()
    email = f"onb-{acc.hex[:10]}@example.com"
    await s.execute(
        text("""
            INSERT INTO accounts (id, email, name, token_version, max_workspaces, created_at, updated_at)
            VALUES (:id, :e, 'Onboarding Tester', 1, :mx, now(), now())
        """),
        {"id": str(acc), "e": email, "mx": max_workspaces},
    )
    await s.commit()
    return acc, email


def _data(**kw: object) -> OnboardingData:
    base: dict[str, object] = {
        "workspace_name": "Risk Dept",
        "org_name": "Acme Holdings",
        "sector": "Microfinance",
        "categories": ["Credit", "Operational", "Fraud"],
        "appetite": {"Credit": 13, "Operational": 13, "Fraud": 9},
    }
    base.update(kw)
    return OnboardingData.model_validate(base)


async def _save(s: AsyncSession, acc: uuid.UUID, step: int, data: OnboardingData) -> None:
    await svc.save_draft(s, acc, OnboardingDraftSave(step=step, data=data))
    await s.commit()


# ── Options ──────────────────────────────────────────────────────────────────

def test_options_use_middle_of_default_scale() -> None:
    o = svc.get_options()
    assert o.matrix_max == 25 and o.appetite_start == 13
    assert o.appetite_note == "SmartRisk suggested thresholds. Set in line with your board-approved risk appetite."
    assert o.sectors[:4] == ["Banking", "Microfinance", "Asset management", "Other Financial Services"]
    assert "Finance" not in o.sectors and o.sectors[-1] == "Other"
    assert [b.label for b in o.bands] == ["Low", "Medium", "High", "Critical"]
    assert o.default_categories == ["Strategic", "Operational", "Financial", "Compliance", "Reputational", "Technical"]
    assert svc.appetite_start(16) == 8 and svc.appetite_start(9) == 5
    # 1-4 Low, 5-9 Medium, 10-16 High, 17-25 Critical
    assert len(o.band_for_score) == 25
    assert [o.band_for_score[s - 1] for s in (1, 4, 5, 9, 10, 13, 16, 17, 25)] == [1, 1, 2, 2, 3, 3, 3, 4, 4]


# ── Draft ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_draft_save_cleans_and_updates_one_row(session: AsyncSession) -> None:
    acc, _ = await _account(session)
    assert await svc.get_draft(session, acc) is None

    await _save(session, acc, 1, _data(workspace_name="  Risk   Dept ", categories=[], appetite={}))
    await _save(session, acc, 2, _data(
        categories=["Credit", " credit ", "", "Fraud", "Third  Party"],
        appetite={"credit": 8, "Gone": 4},
    ))
    d = await svc.get_draft(session, acc)
    assert d is not None and d.step == 2
    assert d.data.workspace_name == "Risk Dept"
    assert d.data.categories == ["Credit", "Fraud", "Third Party"]
    assert d.data.appetite == {"Credit": 8}
    rows = await session.scalar(text("SELECT count(*) FROM onboarding_drafts WHERE account_id = :a"), {"a": str(acc)})
    assert rows == 1


@pytest.mark.asyncio
async def test_draft_belongs_to_its_account(session: AsyncSession) -> None:
    a, _ = await _account(session)
    b, _ = await _account(session)
    await _save(session, a, 1, _data())
    assert await svc.get_draft(session, b) is None


# ── Finish ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_finish_creates_everything_and_clears_draft(session: AsyncSession) -> None:
    acc, email = await _account(session)
    await _save(session, acc, 3, _data())
    res = await svc.finish(session, acc, email)
    await session.commit()

    tid = res.workspace_id
    t = (await session.execute(
        text("SELECT name, industry, framework, timezone, date_format, currency_symbol, workspace_settings FROM tenants WHERE id = :t"),
        {"t": tid},
    )).one()
    assert (t.name, t.industry, t.framework, t.timezone, t.date_format, t.currency_symbol) == (
        "Risk Dept", "Microfinance", "ISO 31000", "Africa/Lagos", "DD/MM/YYYY", "₦",
    )
    assert t.workspace_settings == {"organization": "Acme Holdings"}
    role = await session.scalar(
        text("SELECT role FROM workspace_members WHERE tenant_id = :t AND account_id = :a"), {"t": tid, "a": str(acc)},
    )
    assert role == "Owner"

    # Picked categories replace the defaults.
    cats = await session.scalar(text("SELECT category FROM lookups WHERE tenant_id = :t"), {"t": tid})
    assert list(cats) == ["Credit", "Operational", "Fraud"]

    thr = dict((await session.execute(
        text("SELECT category, threshold FROM appetite_thresholds WHERE tenant_id = :t"), {"t": tid},
    )).all())
    assert thr == {"Credit": 13, "Operational": 13, "Fraud": 9}
    audited = await session.scalar(
        text("SELECT count(*) FROM audit_logs WHERE tenant_id = :t AND action = 'APPETITE_SET'"), {"t": tid},
    )
    assert audited == 3 and res.appetite_saved == 3

    assert await svc.get_draft(session, acc) is None
    # A second click finds no draft and creates nothing.
    with pytest.raises(ResourceNotFoundError):
        await svc.finish(session, acc, email)
    await session.rollback()
    owned = await session.scalar(text("SELECT count(*) FROM tenants WHERE created_by = :a"), {"a": str(acc)})
    assert owned == 1


@pytest.mark.asyncio
async def test_finish_with_appetite_skipped(session: AsyncSession) -> None:
    acc, email = await _account(session)
    await _save(session, acc, 3, _data(appetite_skipped=True))
    res = await svc.finish(session, acc, email)
    await session.commit()
    n = await session.scalar(text("SELECT count(*) FROM appetite_thresholds WHERE tenant_id = :t"), {"t": res.workspace_id})
    assert n == 0 and res.appetite_saved == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("bad, message", [
    ({"workspace_name": ""}, "Give your workspace a name."),
    ({"categories": ["Credit", "Fraud"]}, "Pick at least 3 risk categories."),
    ({"sector": "Finance"}, "Choose a sector from the list."),
    ({"appetite": {"Credit": 26}}, "The appetite for Credit must be between 1 and 25."),
    ({"appetite": {"Credit": 0}}, "The appetite for Credit must be between 1 and 25."),
])
async def test_finish_refuses_incomplete_setup(session: AsyncSession, bad: dict, message: str) -> None:
    acc, email = await _account(session)
    await _save(session, acc, 3, _data(**bad))
    with pytest.raises(ValidationError, match=message):
        await svc.finish(session, acc, email)
    await session.rollback()
    owned = await session.scalar(text("SELECT count(*) FROM tenants WHERE created_by = :a"), {"a": str(acc)})
    assert owned == 0
    assert await svc.get_draft(session, acc) is not None


@pytest.mark.asyncio
async def test_finish_respects_workspace_limit(session: AsyncSession) -> None:
    acc, email = await _account(session, max_workspaces=1)
    await _save(session, acc, 3, _data())
    await svc.finish(session, acc, email)
    await session.commit()
    await _save(session, acc, 3, _data(workspace_name="Second"))
    with pytest.raises(WorkspaceLimitError):
        await svc.finish(session, acc, email)
    await session.rollback()


# ── Endpoints ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_onboarding_endpoints(client: AsyncClient, session: AsyncSession) -> None:
    acc, email = await _account(session)
    headers = {"Authorization": "Bearer " + create_access_token({"sub": str(acc), "email": email, "workspaces": []})}

    r = await client.get("/api/v1/onboarding/options", headers=headers)
    assert r.status_code == 200 and r.json()["data"]["appetite_start"] == 13
    r = await client.get("/api/v1/onboarding/draft", headers=headers)
    assert r.status_code == 200 and r.json()["data"] is None

    body = {"step": 3, "data": _data().model_dump()}
    r = await client.put("/api/v1/onboarding/draft", headers=headers, json=body)
    assert r.status_code == 200, r.text
    assert r.json()["data"]["step"] == 3 and r.json()["data"]["updated_at"]
    r = await client.put("/api/v1/onboarding/draft", headers=headers, json={"step": 4, "data": {}})
    assert r.status_code == 422

    r = await client.post("/api/v1/onboarding/finish", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["data"]["categories"] == ["Credit", "Operational", "Fraud"]
    r = await client.post("/api/v1/onboarding/finish", headers=headers)
    assert r.status_code == 404

    r = await client.get("/api/v1/onboarding/draft")
    assert r.status_code in (401, 403)


# ── Purge ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_old_drafts_are_purged(session: AsyncSession) -> None:
    old, _ = await _account(session)
    fresh, _ = await _account(session)
    await _save(session, old, 2, _data())
    await _save(session, fresh, 2, _data())
    await session.execute(
        text("UPDATE onboarding_drafts SET updated_at = now() - interval '31 days' WHERE account_id = :a"),
        {"a": str(old)},
    )
    await session.commit()
    await purge_housekeeping_tables()
    assert await svc.get_draft(session, old) is None
    assert await svc.get_draft(session, fresh) is not None


def test_healthcare_not_a_sector():
    from app.services.onboarding import SECTORS
    assert "Healthcare" not in SECTORS
    assert len(SECTORS) == 10


# ── SmartRisk suggested thresholds (batch 6) ────────────────────────────────

def test_every_sector_has_suggestions_within_the_scale() -> None:
    opts = svc.get_options()
    assert set(opts.suggestions) == set(svc.SECTORS)
    for sector, rows in opts.suggestions.items():
        names = [r.category.lower() for r in rows]
        assert len(names) == len(set(names)) >= opts.min_categories, sector
        assert all(1 <= r.threshold <= opts.matrix_max for r in rows), sector
        assert all(len(r.category) <= 200 for r in rows)
    assert "board-approved" in opts.appetite_note
    assert opts.guide_url.endswith(".pdf")


def test_suggestions_match_the_smartrisk_guide() -> None:
    s = {k: dict((r.category, r.threshold) for r in v) for k, v in svc.get_options().suggestions.items()}
    assert s["Banking"] == {"Credit": 9, "Liquidity": 6, "Market": 8, "Operational": 8, "Third Party": 8,
                            "Technology": 6, "Fraud & AML": 4, "Regulatory": 4}
    assert s["Microfinance"]["Credit"] == 10
    assert s["Technology"]["Cyber security"] == 5
    assert max(s["Government"].values()) == 8  # no core risk at 10 for public bodies
    assert s["Other"] == {"Strategic": 10, "Financial": 8, "Operational": 8, "Third Party": 8, "People": 8,
                          "Regulatory": 4}


@pytest.mark.asyncio
async def test_finish_saves_suggested_values(session: AsyncSession) -> None:
    acc, email = await _account(session)
    cats = [r.category for r in svc.get_options().suggestions["Oil & gas"]]
    appetite = {r.category: r.threshold for r in svc.get_options().suggestions["Oil & gas"]}
    await _save(session, acc, 3, _data(sector="Oil & gas", categories=cats, appetite=appetite))
    res = await svc.finish(session, acc, email)
    await session.commit()
    assert res.categories == cats and res.appetite_saved == len(cats)
    rows = dict((await session.execute(text(
        "SELECT category, threshold FROM appetite_thresholds WHERE tenant_id = :t"),
        {"t": res.workspace_id})).all())
    assert rows == appetite
