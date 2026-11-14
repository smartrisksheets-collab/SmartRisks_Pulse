"""
backend/tests/test_ui_step7_reports.py

Report Builder rebuild (UI step 7): the three new sections (risks outside
appetite, decisions needed, control evidence), their PDF and PowerPoint
output, print_reports enforcement on export, email and template writes,
per-person drafts (migration 065) and the 065 SQL file.
"""

import asyncio
import os
import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.migration_sql import SQL_DIR, split_sql
from app.services import pdf_report, pptx_report
from app.services.report import (
    BLOCK_REGISTRY,
    IncidentRow,
    ReportContext,
    RiskRow,
    SECTION_ROW_CAP,
    compute_appetite_breaches,
    compute_control_evidence,
    compute_decisions_needed,
)
from conftest import _make_token, _OWNER_PERMS

NEW_BLOCKS = ["appetite-breaches", "decisions-needed", "control-evidence"]
TODAY = date.today()


@pytest_asyncio.fixture(autouse=True)
async def _drain_error_log_writes():
    """4xx answers make ErrorLogMiddleware write api_error_log in a fire-and-forget task.
    Wait for those writes, so an unfinished one never holds a lock when the session
    fixture drops the test schema."""
    yield
    pending = [t for t in asyncio.all_tasks()
               if t is not asyncio.current_task() and t.get_coro().__name__ == "_persist"]
    if pending:
        await asyncio.wait(pending, timeout=5)


# ── Builders ────────────────────────────────────────────────────────────────

def _risk(rid: str, **kw: object) -> RiskRow:
    base: dict = {
        "id": rid, "category": "Operational", "desc": f"Description of {rid}", "owner": "Ada",
        "level": "Medium", "level_index": 2, "is_elevated": False, "treatment": "Reduce",
        "residual": 5.0, "movement": "Stable", "score_delta": 0.0, "control_effectiveness": None,
        "logged_at": TODAY, "last_reviewed_at": TODAY, "likelihood": 2, "impact_score": 3,
        "severity_raw": 6.0, "controls": "", "appetite_status": None, "linked_decision": "",
        "linked_decision_at": None, "financial_exposure": "", "control_last_tested": None,
        "control_assertion_source": "", "mitigation_plan": "",
    }
    base.update(kw)
    return RiskRow(**base)


def _ctx(risks: list[RiskRow], incidents: list[IncidentRow] | None = None, enabled: bool = True) -> ReportContext:
    incs = incidents or []
    return ReportContext(
        tenant_id=uuid.uuid4(), risks=risks, all_risks=risks, incidents=incs, all_incidents=incs,
        date_from=TODAY - timedelta(days=30), date_to=TODAY, incidents_enabled=enabled,
    )


def _inc(iid: str, risk_id: str, reported: date) -> IncidentRow:
    return IncidentRow(id=iid, category="Cyber", severity="High", status="New", desc="x",
                       reported_at=reported, resolved_at=None, financial_impact=0.0, linked_risk_id=risk_id)


# ── Registry ────────────────────────────────────────────────────────────────

def test_new_blocks_registered_in_all_three_registries():
    for key in NEW_BLOCKS:
        assert key in BLOCK_REGISTRY
        assert key in pdf_report._RENDERERS
        assert key in pptx_report.RENDERERS
        assert key in pdf_report._LABELS
        assert key in pptx_report.LABELS


# ── Risks outside appetite ──────────────────────────────────────────────────

def test_appetite_no_risks():
    d = compute_appetite_breaches(_ctx([]))
    assert d["count"] == 0 and d["risks"] == []
    assert d["narrative"] == "The register holds no active risks."


def test_appetite_no_thresholds_configured():
    d = compute_appetite_breaches(_ctx([_risk("R-1")]))
    assert d["thresholds_configured"] is False
    assert "No appetite thresholds are set" in d["narrative"]


def test_appetite_none_outside_but_some_near():
    risks = [_risk("R-1", threshold=10.0, appetite_status="Near", residual=8.0),
             _risk("R-2", threshold=10.0, appetite_status="Within", residual=2.0)]
    d = compute_appetite_breaches(_ctx(risks))
    assert d["count"] == 0 and d["near_count"] == 1
    assert d["narrative"] == "No risk is outside appetite. 1 risk is near its threshold."


def test_appetite_breaches_sorted_by_gap_and_whole_numbers():
    risks = [
        _risk("R-1", threshold=8.0, appetite_status="Exceeds", residual=10.5, title="Small gap"),
        _risk("R-2", threshold=4.0, appetite_status="Exceeds", residual=12.5, title=""),
        _risk("R-3", threshold=4.0, appetite_status="Within", residual=3.0),
    ]
    d = compute_appetite_breaches(_ctx(risks))
    assert d["count"] == 2
    assert [r["id"] for r in d["risks"]] == ["R-2", "R-1"]
    first = d["risks"][0]
    # Half rounds up: 12.5 -> 13, gap 8.5 -> 9. Python round() would give 12 and 8.
    assert first["residual"] == 13 and first["threshold"] == 4 and first["over_by"] == 9
    assert first["title"] == "Description of R-2"   # falls back to the description
    assert d["risks"][1]["title"] == "Small gap"
    assert "2 risks sit above" in d["narrative"]


def test_appetite_rows_capped():
    risks = [_risk(f"R-{i}", threshold=1.0, appetite_status="Exceeds", residual=5.0)
             for i in range(SECTION_ROW_CAP + 3)]
    d = compute_appetite_breaches(_ctx(risks))
    assert d["count"] == SECTION_ROW_CAP + 3
    assert len(d["risks"]) == SECTION_ROW_CAP and d["rows_truncated"] is True


# ── Decisions needed ────────────────────────────────────────────────────────

def test_decisions_needed_rules_and_order():
    risks = [
        _risk("R-1", is_elevated=True, level="High", level_index=3, residual=9.0),
        _risk("R-2", is_elevated=True, level="Critical", level_index=4, residual=16.0, mitigation_status="Accepted"),
        _risk("R-3", is_elevated=True, level="Critical", level_index=4, residual=15.0, linked_decision="Board 12 Oct"),
        _risk("R-4", is_elevated=False, appetite_status="Exceeds", level="Medium", level_index=2, residual=6.0),
        _risk("R-5", is_elevated=False, residual=2.0),
        _risk("R-6", is_elevated=True, level="Critical", level_index=4, residual=14.4, linked_decision="   "),
    ]
    d = compute_decisions_needed(_ctx(risks))
    assert [r["id"] for r in d["risks"]] == ["R-4", "R-6", "R-1"]
    assert d["risks"][0]["reason"] == "Outside appetite"
    assert d["risks"][1]["reason"] == "Critical band"
    assert d["risks"][1]["residual"] == 14
    assert d["count"] == 3
    assert "3 risks that are elevated or outside appetite have no recorded decision" in d["narrative"]


def test_decisions_none_needed():
    d = compute_decisions_needed(_ctx([_risk("R-1")]))
    assert d["count"] == 0
    assert d["narrative"] == "Every elevated or out-of-appetite risk has a recorded decision."


# ── Control evidence ────────────────────────────────────────────────────────

def test_control_evidence_nothing_rated():
    d = compute_control_evidence(_ctx([_risk("R-1")]))
    assert d["rated"] == 0 and d["unrated"] == 1 and d["gaps"] == []
    assert d["narrative"].startswith("No control has been rated yet")


def test_control_evidence_gaps_and_contradiction():
    recent = TODAY - timedelta(days=30)
    old = TODAY - timedelta(days=400)
    risks = [
        _risk("R-1", control_effectiveness=4, control_last_tested=recent,
              control_assertion_source="Independently tested", residual=3.0),        # evidenced
        _risk("R-2", control_effectiveness=3, control_last_tested=recent,
              control_assertion_source="Self-assessed", residual=6.0),               # self-assessed
        _risk("R-3", control_effectiveness=2, control_last_tested=old,
              control_assertion_source="External audit", residual=8.0),              # stale test
        _risk("R-4", control_effectiveness=5, control_last_tested=recent,
              control_assertion_source="External audit", residual=2.0),              # evidenced, contradicted
        _risk("R-5", control_effectiveness=None),                                    # unrated
    ]
    incidents = [_inc("INC-1", "R-4", TODAY - timedelta(days=5)), _inc("INC-2", "R-4", TODAY - timedelta(days=2))]
    d = compute_control_evidence(_ctx(risks, incidents))
    assert d["rated"] == 4 and d["unrated"] == 1
    assert d["evidenced"] == 2 and d["contradicted"] == 1
    ids = [g["id"] for g in d["gaps"]]
    assert ids == ["R-4", "R-3", "R-2"]                     # contradicted first, then by residual
    assert d["gaps"][0]["reasons"] == ["Contradicted by INC-2"]   # latest incident named
    assert d["gaps"][1]["reasons"] == ["Not tested in the last 12 months"]
    assert d["gaps"][2]["reasons"] == ["Self-assessed"]
    assert "2 of 4 rated controls are evidenced" in d["narrative"]
    assert "1 rating was contradicted" in d["narrative"]


def test_control_evidence_ignores_incidents_when_module_off():
    risks = [_risk("R-4", control_effectiveness=5, control_last_tested=TODAY,
                   control_assertion_source="External audit")]
    d = compute_control_evidence(_ctx(risks, [_inc("INC-1", "R-4", TODAY)], enabled=False))
    assert d["contradicted"] == 0 and d["gaps"] == []


def test_control_evidence_missing_test_and_source():
    d = compute_control_evidence(_ctx([_risk("R-1", control_effectiveness=1)]))
    assert d["gaps"][0]["reasons"] == ["No test date", "No assertion source"]


# ── Export renderers ────────────────────────────────────────────────────────

def _sample_block_data() -> dict:
    recent = TODAY - timedelta(days=10)
    risks = [
        _risk(f"R-{i}", is_elevated=True, level="High", level_index=3, residual=9.0 + i,
              threshold=4.0, appetite_status="Exceeds", control_effectiveness=4,
              control_last_tested=recent, control_assertion_source="Self-assessed",
              title=f"Risk <{i}> & co")
        for i in range(8)
    ]
    ctx = _ctx(risks)
    return {k: BLOCK_REGISTRY[k](ctx) for k in NEW_BLOCKS}


@pytest.mark.parametrize("data_fn", [_sample_block_data, lambda: {k: BLOCK_REGISTRY[k](_ctx([])) for k in NEW_BLOCKS}])
def test_pdf_and_pptx_render_new_blocks(data_fn):
    data = data_fn()
    pdf = pdf_report.build_pdf(blocks=NEW_BLOCKS, block_data=data, ai_data={}, settings_p={})
    assert pdf[:4] == b"%PDF"
    deck = pptx_report.build_pptx(blocks=NEW_BLOCKS, block_data=data, ai_data={}, settings_p={})
    assert deck[:2] == b"PK"


def test_pdf_renderer_escapes_titles():
    data = _sample_block_data()
    out = pdf_report._render_appetite_breaches(data["appetite-breaches"], None)
    assert out   # a raw "<" in a title would raise inside ReportLab's Paragraph parser


# ── print_reports enforcement ───────────────────────────────────────────────

@pytest.fixture
def no_print_headers(seed) -> dict:
    perms = {**_OWNER_PERMS, "print_reports": False}
    return {"Authorization": f"Bearer {_make_token(seed, 'Analyst', perms, ['risk', 'incident'])}"}


@pytest.mark.asyncio
async def test_export_requires_print_reports(client: AsyncClient, no_print_headers: dict, owner_headers: dict):
    body = {"blocks": [], "block_data": {}, "ai_data": {}, "settings": {}, "format": "pdf"}
    r = await client.post("/api/v1/reports/export", json=body, headers=no_print_headers)
    assert r.status_code == 403
    assert r.json()["error"] == "Permission denied: print_reports required"
    r = await client.post("/api/v1/reports/export", json=body, headers=owner_headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_email_requires_print_reports(client: AsyncClient, no_print_headers: dict):
    body = {"blocks": [], "block_data": {}, "to": "a@b.co", "subject": "x"}
    r = await client.post("/api/v1/reports/email", json=body, headers=no_print_headers)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_template_writes_require_print_reports(client: AsyncClient, no_print_headers: dict, owner_headers: dict):
    body = {"name": "Board", "blocks": ["top-risks"], "settings": {}}
    r = await client.post("/api/v1/reports/templates", json=body, headers=no_print_headers)
    assert r.status_code == 403
    r = await client.post("/api/v1/reports/templates", json=body, headers=owner_headers)
    assert r.status_code == 200
    tid = r.json()["data"]["template_id"]
    assert (await client.post(f"/api/v1/reports/templates/{tid}/default", headers=no_print_headers)).status_code == 403
    assert (await client.delete(f"/api/v1/reports/templates/{tid}", headers=no_print_headers)).status_code == 403
    # Reading templates stays open to every member.
    assert (await client.get("/api/v1/reports/templates", headers=no_print_headers)).status_code == 200
    assert (await client.delete(f"/api/v1/reports/templates/{tid}", headers=owner_headers)).status_code == 200


@pytest.mark.asyncio
async def test_preview_returns_new_blocks(client: AsyncClient, owner_headers: dict):
    r = await client.post("/api/v1/reports/preview", json={"blocks": NEW_BLOCKS}, headers=owner_headers)
    assert r.status_code == 200
    assert set(r.json()["data"]["block_data"]) == set(NEW_BLOCKS)


# ── Drafts ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def second_member(seed) -> dict:
    """Another account in the seed workspace, and a second workspace for the seed account."""
    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    acc, other_tenant = uuid.uuid4(), uuid.uuid4()
    async with maker() as s:
        await s.execute(text("""
            INSERT INTO accounts (id, email, name, token_version, created_at, updated_at)
            VALUES (:id, :email, 'Second', 1, now(), now())
        """), {"id": str(acc), "email": f"second-{acc.hex[:8]}@example.com"})
        await s.execute(text("""
            INSERT INTO tenants (id, name, industry, plan, trial_start_date, payment_active,
                max_risks, max_users, modules, currency_symbol, created_by, created_at, updated_at)
            VALUES (:id, 'Draft Other', 'Technology', 'TRIAL', CURRENT_DATE, false,
                1000, 25, ARRAY['risk','incident'], '$', :by, now(), now())
        """), {"id": str(other_tenant), "by": seed["account_id"]})
        await s.commit()
    await engine.dispose()
    other_person = {**seed, "account_id": str(acc), "email": "second@example.com"}
    other_space = {**seed, "tenant_id": str(other_tenant)}
    return {
        "person":  {"Authorization": f"Bearer {_make_token(other_person, 'Analyst', _OWNER_PERMS, ['risk', 'incident'])}"},
        "space":   {"Authorization": f"Bearer {_make_token(other_space, 'Owner', _OWNER_PERMS, ['risk', 'incident'])}"},
    }


def _draft(**kw: object) -> dict:
    d: dict = {
        "blocks": ["top-risks", "appetite-breaches", "no-such-block", "top-risks", "ai-exec-summary"],
        "settings": {"report_title": "November pack", "footer_text": "Internal"},
        "ai_data": {"ai-exec-summary": "Summary text", "executive-dashboard": "Removed section", "top-risks": ""},
        "ai_reviewed": ["ai-exec-summary", "executive-dashboard", "top-risks"],
        "period": {"preset": "quarter_to_date", "date_from": "2026-10-01", "date_to": "2026-11-14"},
        "template": "builtin:monthly",
    }
    d.update(kw)
    return {"draft": d}


@pytest.mark.asyncio
async def test_draft_round_trip_cleans_and_upserts(client: AsyncClient, owner_headers: dict, second_member: dict):
    await client.delete("/api/v1/reports/draft", headers=owner_headers)
    r = await client.get("/api/v1/reports/draft", headers=owner_headers)
    assert r.status_code == 200 and r.json()["data"]["draft"] is None

    r = await client.put("/api/v1/reports/draft", json=_draft(), headers=owner_headers)
    assert r.status_code == 200
    saved = r.json()["data"]["draft"]
    assert saved["blocks"] == ["top-risks", "appetite-breaches", "ai-exec-summary"]
    assert saved["ai_data"] == {"ai-exec-summary": "Summary text"}
    assert saved["ai_reviewed"] == ["ai-exec-summary"]
    assert saved["settings"]["report_title"] == "November pack"
    assert saved["period"]["date_from"] == "2026-10-01"

    # A second save overwrites the same row.
    r = await client.put("/api/v1/reports/draft", json=_draft(blocks=["methodology"], ai_data={}, ai_reviewed=[]),
                         headers=owner_headers)
    assert r.status_code == 200
    got = (await client.get("/api/v1/reports/draft", headers=owner_headers)).json()["data"]["draft"]
    assert got["blocks"] == ["methodology"] and got["updated_at"]

    # Another person in the workspace, and the same person in another workspace, see no draft.
    assert (await client.get("/api/v1/reports/draft", headers=second_member["person"])).json()["data"]["draft"] is None
    assert (await client.get("/api/v1/reports/draft", headers=second_member["space"])).json()["data"]["draft"] is None

    r = await client.delete("/api/v1/reports/draft", headers=owner_headers)
    assert r.json()["data"]["deleted"] is True
    r = await client.delete("/api/v1/reports/draft", headers=owner_headers)
    assert r.json()["data"]["deleted"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", [
    {"period": {"preset": "custom", "date_from": "14/11/2026"}},
    {"blocks": ["top-risks"] * 41},
    {"ai_data": {"ai-exec-summary": "x" * 20001}},
])
async def test_draft_rejects_bad_input(client: AsyncClient, owner_headers: dict, bad: dict):
    r = await client.put("/api/v1/reports/draft", json=_draft(**bad), headers=owner_headers)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_draft_requires_sign_in(client: AsyncClient):
    assert (await client.get("/api/v1/reports/draft")).status_code in (401, 403)


# ── Migration 065 SQL ───────────────────────────────────────────────────────

def test_065_sql_splits_into_single_statements():
    up = split_sql((SQL_DIR / "065_report_drafts.sql").read_text(encoding="utf-8"))
    assert len(up) == 5
    assert up[0].startswith("CREATE TABLE IF NOT EXISTS report_drafts")
    assert up[-1].startswith("DO $$") and up[-1].endswith("END $$")
    down = split_sql((SQL_DIR / "065_report_drafts_down.sql").read_text(encoding="utf-8"))
    assert down == ["DROP TABLE IF EXISTS report_drafts"]
