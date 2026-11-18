"""
backend/tests/test_incident_views.py

Incidents rebuild (UI step 6): the stage line, target wording, quick-view
counts and filters, link state, side-panel context, target preview, partial
updates, recycle restore and migration 064. Service tests use their own tenant
so counts are exact.
"""

import os
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.exceptions import PermissionDeniedError, ResourceNotFoundError, ValidationError
from app.db.migration_sql import SQL_DIR, split_sql
from app.models.audit_log import AuditLog
from app.models.incident import Incident
from app.schemas.incident import IncidentCreate, IncidentUpdate, TargetPreviewRequest
from app.schemas.risk import RiskCreate
from app.services import incident as svc
from app.services import incident_status as st
from app.services import recycle
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
                :id, 'Incident Test', 'Technology', 'TRIAL', CURRENT_DATE, false,
                1000, 25, ARRAY['risk','incident'], '$', :created_by, now(), now()
            )
        """),
        {"id": str(tid), "created_by": seed["account_id"]},
    )
    return tid


def _inc(**kw: object) -> IncidentCreate:
    base: dict[str, object] = {
        "description": "Something went wrong at the branch",
        "category": "Compliance", "severity": "Medium",
        "reported_by": "Tunde", "reported_at": date.today(),
    }
    base.update(kw)
    return IncidentCreate(**base)  # type: ignore[arg-type]


async def _populate(s: AsyncSession, tid: uuid.UUID) -> dict[str, str]:
    """R-001 Compliance (high residual, rated well controlled), R-002 Compliance (low).

    INC-1 Compliance, Very High, New, unlinked (covered)
    INC-2 Cybersecurity, High, Investigating, unlinked (not covered)
    INC-3 Compliance, Low, Remediating, linked to R-001
    INC-4 Compliance, Medium, Resolved
    """
    await risk_svc.create_risk(s, tid, RiskCreate(
        title="Regulatory filing missed", category="Compliance", description="Late filings",
        owner="Ada", treatment="Mitigate", likelihood=5, impact_score=5, control_effectiveness=4,
    ), "a@x.com")
    await risk_svc.create_risk(s, tid, RiskCreate(
        category="Compliance", description="Minor policy drift", owner="Ada",
        treatment="Mitigate", likelihood=1, impact_score=2,
    ), "a@x.com")
    old = date.today() - timedelta(days=30)
    a = await svc.create_incident(s, tid, _inc(title="Late KYC file", severity="Very High",
                                               assigned_to="Tunde A."), "a@x.com")
    b = await svc.create_incident(s, tid, _inc(title="Phishing email", category="Cybersecurity",
                                               severity="High", status="In Progress",
                                               reported_at=old, assigned_to="Segun"), "a@x.com")
    c = await svc.create_incident(s, tid, _inc(title="Branch audit gap", severity="Low",
                                               status="Remediating", linked_risk_id="R-001",
                                               control_outcome="control_failed",
                                               reported_at=date.today() - timedelta(days=2)), "a@x.com")
    first = old - timedelta(days=5)
    d = await svc.create_incident(s, tid, _inc(
        title="Old breach", status="Resolved", reported_at=first,
        resolved_at=datetime(first.year, first.month, first.day, tzinfo=timezone.utc) + timedelta(days=2),
    ), "a@x.com")
    await s.commit()
    return {"a": a.id, "b": b.id, "c": c.id, "d": d.id}


# ── Pure helpers ─────────────────────────────────────────────────────────────

def test_stage_line_and_legacy_names() -> None:
    assert st.normalise_status("In Progress") == "Investigating"
    assert st.normalise_status("Open") == "Triaged"
    assert st.normalise_status("Under Review") == "Remediating"
    assert st.normalise_status(None) == "New"
    assert st.is_open("Under Review") and not st.is_open("Closed")
    assert st.next_status("New") == "Triaged"
    assert st.next_status("Resolved") == "Closed"
    assert st.next_status("Closed") is None
    assert st.next_label("Remediating") == "Mark as resolved"
    assert [x for _, x in st.stepper("Investigating")] == ["done", "done", "current", "todo", "todo"]
    assert all(x == "done" for _, x in st.stepper("Closed"))


def test_target_wording() -> None:
    today = date(2026, 11, 13)
    # 72h from 11 Nov: last day inside the target is 13 Nov.
    assert st.resolve_by(date(2026, 11, 11), 72) == date(2026, 11, 13)
    assert st.target_state(status="New", reported_at=date(2026, 11, 11), resolved_at=None,
                           hours=72, breached=False, today=today)[:2] == ("due_today", "Due today")
    assert st.target_state(status="New", reported_at=date(2026, 11, 12), resolved_at=None,
                           hours=72, breached=False, today=today)[:2] == ("due", "Due in 1 day")
    assert st.target_state(status="Triaged", reported_at=date(2026, 11, 1), resolved_at=None,
                           hours=72, breached=True, today=today)[:2] == ("missed", "Missed by 10 days")
    done = datetime(2026, 11, 3, tzinfo=timezone.utc)
    assert st.target_state(status="Resolved", reported_at=date(2026, 11, 1), resolved_at=done,
                           hours=72, breached=False, today=today)[:2] == ("met", "Met")
    late = datetime(2026, 11, 9, tzinfo=timezone.utc)
    assert st.target_state(status="Closed", reported_at=date(2026, 11, 1), resolved_at=late,
                           hours=72, breached=False, today=today)[:2] == ("missed", "Missed by 5 days")
    assert st.target_state(status="New", reported_at=None, resolved_at=None,
                           hours=72, breached=False, today=today)[0] == "none"


def test_schema_checks() -> None:
    assert _inc(status="Open").status == "Triaged"
    assert _inc(status=None).status == "New"
    with pytest.raises(PydanticValidationError):
        _inc(status="Pending")
    with pytest.raises(PydanticValidationError):
        _inc(title="x" * 81)
    with pytest.raises(PydanticValidationError):
        _inc(control_outcome="worked well")
    assert _inc(control_outcome="", impact_confidence="").control_outcome is None
    assert _inc(title="   ").title is None
    with pytest.raises(PydanticValidationError):
        IncidentUpdate(description="  ")


# ── Service ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_views_list_and_row_labels(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    ids = await _populate(session, tid)

    v = await svc.get_view_counts(session, tid)
    assert (v.open, v.unlinked, v.high, v.resolved, v.all) == (3, 2, 2, 1, 4)
    assert v.high_label == "High or above"
    assert v.summary == "3 open, 2 of them high or above. 2 open incidents have no linked risk."
    assert v.owners == ["Segun", "Tunde A."]

    filtered = await svc.get_view_counts(session, tid, category="Cybersecurity")
    assert (filtered.open, filtered.all) == (1, 1)
    assert filtered.summary == v.summary            # summary describes the whole log

    page = await svc.list_incidents(session, tid, page_size=50)
    assert [r.id for r in page.items][-1] == ids["d"]   # newest first, oldest last
    rows = {r.id: r for r in page.items}
    assert rows[ids["b"]].status == "Investigating"
    assert rows[ids["b"]].link_state == "uncovered"
    assert rows[ids["b"]].target_state == "missed"
    assert rows[ids["a"]].link_state == "unlinked"
    assert rows[ids["a"]].is_high is True
    assert rows[ids["c"]].link_state == "linked"
    assert rows[ids["c"]].linked_risk_title == "Regulatory filing missed"
    assert rows[ids["d"]].is_open is False and rows[ids["d"]].target_state == "met"

    unlinked = await svc.list_incidents(session, tid, view="unlinked")
    assert {r.id for r in unlinked.items} == {ids["a"], ids["b"]}
    high = await svc.list_incidents(session, tid, view="high")
    assert {r.id for r in high.items} == {ids["a"], ids["b"]}
    resolved = await svc.list_incidents(session, tid, view="resolved")
    assert [r.id for r in resolved.items] == [ids["d"]]
    by_owner = await svc.list_incidents(session, tid, owner="Segun")
    assert [r.id for r in by_owner.items] == [ids["b"]]
    by_title = await svc.list_incidents(session, tid, search="phishing")
    assert [r.id for r in by_title.items] == [ids["b"]]
    with pytest.raises(ValidationError):
        await svc.list_incidents(session, tid, view="everything")


@pytest.mark.asyncio
async def test_severity_must_be_a_workspace_level(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    with pytest.raises(ValidationError):
        await svc.create_incident(session, tid, _inc(severity="Critical"), "a@x.com")
    await session.execute(
        text("INSERT INTO incident_severity_levels (tenant_id, label, sort_order) VALUES (:t, 'Critical', 1)"),
        {"t": str(tid)},
    )
    inc = await svc.create_incident(session, tid, _inc(severity="Critical"), "a@x.com")
    assert inc.severity == "Critical"
    with pytest.raises(ValidationError):
        await svc.update_incident(session, tid, inc.id, IncidentUpdate(severity="Medium"), "a@x.com")
    await session.rollback()


@pytest.mark.asyncio
async def test_update_rules(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    ids = await _populate(session, tid)

    res = await svc.update_incident(session, tid, ids["a"], IncidentUpdate(status="Resolved"), "a@x.com")
    assert res.resolved_at is not None
    res = await svc.update_incident(session, tid, ids["a"], IncidentUpdate(status="Triaged"), "a@x.com")
    assert res.resolved_at is None                      # reopened

    # null on a required field is ignored; null on an optional one clears it
    res = await svc.update_incident(session, tid, ids["c"],
                                    IncidentUpdate(description=None, linked_risk_id=None), "a@x.com")
    assert res.description == "Something went wrong at the branch"
    assert res.linked_risk_id is None and res.control_outcome is None

    with pytest.raises(ValidationError):
        await svc.update_incident(session, tid, ids["c"], IncidentUpdate(linked_risk_id="R-999"), "a@x.com")
    await session.rollback()

    res = await svc.update_incident(session, tid, ids["b"], IncidentUpdate(status="Under Review"), "a@x.com")
    assert res.status == "Remediating"
    await session.commit()
    last = (await session.execute(
        select(AuditLog.summary).where(AuditLog.tenant_id == tid, AuditLog.record_id == ids["b"])
        .order_by(AuditLog.created_at.desc()).limit(1)
    )).scalar_one()
    assert last == "Moved from Investigating to Remediating"


@pytest.mark.asyncio
async def test_panel_context(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    ids = await _populate(session, tid)

    a = await svc.get_incident_context(session, tid, ids["a"])
    assert [s.state for s in a.steps][:2] == ["current", "todo"]
    assert a.next_status == "Triaged" and a.next_label == "Move to Triaged"
    assert a.covered is True and a.linked_risk is None
    assert [r.id for r in a.suggested_risks] == ["R-001", "R-002"]   # highest residual first
    assert a.suggested_risks[0].residual == 5                         # whole number
    assert a.history and a.history[0].summary.startswith("Logged as New")

    b = await svc.get_incident_context(session, tid, ids["b"])
    assert b.covered is False and b.suggested_risks == []
    assert "No risk on the register covers Cybersecurity" in b.link_note

    c = await svc.get_incident_context(session, tid, ids["c"])
    assert c.linked_risk is not None and c.linked_risk.title == "Regulatory filing missed"
    await session.execute(text("UPDATE risks SET deleted_at = now() WHERE tenant_id = :t AND id = 'R-001'"),
                          {"t": str(tid)})
    c = await svc.get_incident_context(session, tid, ids["c"])
    assert c.linked_risk is not None and c.linked_risk.on_register is False

    with pytest.raises(ResourceNotFoundError):
        await svc.get_incident_context(session, tid, "INC-0000-999")
    await session.rollback()


@pytest.mark.asyncio
async def test_target_preview(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await _populate(session, tid)
    reported = date(2026, 11, 11)

    p = await svc.target_preview(session, tid, TargetPreviewRequest(
        severity="High", reported_at=reported, category="Cybersecurity"))
    assert p.target_days == 3 and p.resolve_by == date(2026, 11, 13)
    assert p.covered is False
    assert any("blind spot" in o for o in p.outcomes)
    assert any("Home summary" in o for o in p.outcomes)

    p = await svc.target_preview(session, tid, TargetPreviewRequest(
        severity="Low", reported_at=reported, category="Compliance", linked_risk_id="R-001"))
    assert any("contradicted" in o for o in p.outcomes)
    assert p.suggested_risks == []

    p = await svc.target_preview(session, tid, TargetPreviewRequest(severity="Low", category="Compliance"))
    assert [r.id for r in p.suggested_risks] == ["R-001", "R-002"]

    with pytest.raises(ValidationError):
        await svc.target_preview(session, tid, TargetPreviewRequest(severity="Low", linked_risk_id="R-404"))
    with pytest.raises(ValidationError):
        await svc.target_preview(session, tid, TargetPreviewRequest(severity="Severe"))
    await session.rollback()


@pytest.mark.asyncio
async def test_restore_keeps_every_field(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    ids = await _populate(session, tid)
    await session.execute(text("UPDATE incidents SET status = 'Under Review' WHERE tenant_id = :t AND id = :i"),
                          {"t": str(tid), "i": ids["c"]})
    await svc.delete_incident(session, tid, ids["c"], "a@x.com")
    bin_id = (await session.execute(
        text("SELECT id FROM recycle_bin WHERE tenant_id = :t AND item_id = :i"), {"t": str(tid), "i": ids["c"]}
    )).scalar_one()
    with pytest.raises(PermissionDeniedError):
        await recycle.restore_item(session, tid, bin_id, "a@x.com", permissions={"manage_risks": True})
    await recycle.restore_item(session, tid, bin_id, "a@x.com", permissions={"manage_incidents": True})
    inc = (await session.execute(
        select(Incident).where(Incident.tenant_id == tid, Incident.id == ids["c"])
    )).scalar_one()
    assert inc.linked_risk_id == "R-001"
    assert inc.control_outcome == "control_failed"
    assert inc.status == "Remediating"
    await session.rollback()


@pytest.mark.asyncio
async def test_migration_064_sql(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    for n, status_ in enumerate(["Open", "In Progress", "Under Review", "Resolved", ""]):
        await session.execute(
            text("INSERT INTO incidents (id, tenant_id, status) VALUES (:i, :t, :s)"),
            {"i": f"INC-M-{n}", "t": str(tid), "s": status_},
        )
    up = split_sql((SQL_DIR / "064_incident_stages.sql").read_text())
    for _ in range(2):                                   # safe to run twice
        for stmt in up:
            await session.execute(text(stmt))
    got = (await session.execute(
        text("SELECT id, status FROM incidents WHERE tenant_id = :t ORDER BY id"), {"t": str(tid)}
    )).all()
    assert [g.status for g in got] == ["Triaged", "Investigating", "Remediating", "Resolved", "New"]
    for stmt in split_sql((SQL_DIR / "064_incident_stages_down.sql").read_text()):
        await session.execute(text(stmt))
    got = (await session.execute(
        text("SELECT status FROM incidents WHERE tenant_id = :t ORDER BY id"), {"t": str(tid)}
    )).scalars().all()
    assert got == ["Open", "In Progress", "Under Review", "Resolved", "New"]
    await session.rollback()


# ── HTTP ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_endpoints(client: AsyncClient, owner_headers: dict) -> None:
    r = await client.post("/api/v1/incidents", json={
        "description": "Endpoint check for step six", "category": "Compliance", "severity": "High",
        "reported_by": "CI", "reported_at": date.today().isoformat(), "title": "Step six",
        "status": "Open",
    }, headers=owner_headers)
    assert r.status_code == 200
    inc_id = r.json()["data"]["id"]
    assert r.json()["data"]["status"] == "Triaged"

    r = await client.get("/api/v1/incidents/views", headers=owner_headers)
    assert r.status_code == 200 and r.json()["data"]["all"] >= 1

    r = await client.get("/api/v1/incidents?view=open&page_size=50", headers=owner_headers)
    assert r.status_code == 200
    assert any(i["id"] == inc_id and i["target_text"] for i in r.json()["data"])

    r = await client.get(f"/api/v1/incidents/{inc_id}/context", headers=owner_headers)
    assert r.status_code == 200 and r.json()["data"]["next_label"] == "Move to Investigating"

    r = await client.get("/api/v1/incidents/INC-0000-404/context", headers=owner_headers)
    assert r.status_code == 404

    r = await client.post("/api/v1/incidents/target-preview", json={"severity": "High"}, headers=owner_headers)
    assert r.status_code == 200 and r.json()["data"]["target_days"] == 3

    r = await client.post("/api/v1/incidents/target-preview", json={"severity": "Nope"}, headers=owner_headers)
    assert r.status_code == 422

    r = await client.get("/api/v1/incidents?view=bogus", headers=owner_headers)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_analyst_cannot_write(client: AsyncClient, analyst_headers: dict) -> None:
    r = await client.post("/api/v1/incidents", json={
        "description": "Analyst should be blocked", "category": "Compliance",
        "reported_by": "CI", "reported_at": date.today().isoformat(),
    }, headers=analyst_headers)
    assert r.status_code == 403
    r = await client.get("/api/v1/incidents/views", headers=analyst_headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_bin_needs_manage_permission(
    client: AsyncClient, owner_headers: dict, analyst_headers: dict,
) -> None:
    """Security fix: a view-only member could restore or purge bin items before step 6."""
    r = await client.post("/api/v1/incidents", json={
        "description": "Bin permission check record", "category": "Compliance",
        "reported_by": "CI", "reported_at": date.today().isoformat(),
    }, headers=owner_headers)
    inc_id = r.json()["data"]["id"]
    await client.delete(f"/api/v1/incidents/{inc_id}", headers=owner_headers)
    items = (await client.get("/api/v1/recycle?item_type=incident", headers=owner_headers)).json()["data"]
    bin_id = next(i["bin_id"] for i in items if i["item_id"] == inc_id)

    assert (await client.post(f"/api/v1/recycle/{bin_id}/restore", headers=analyst_headers)).status_code == 403
    assert (await client.delete(f"/api/v1/recycle/{bin_id}", headers=analyst_headers)).status_code == 403
    assert (await client.post(f"/api/v1/recycle/{bin_id}/restore", headers=owner_headers)).status_code == 200
