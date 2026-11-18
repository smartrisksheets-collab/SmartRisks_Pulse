"""Ask Pulse content checks: correctness against the engine, and coverage of the app.

The coverage tests read the frontend source, so a new page, settings tab or "?"
explainer cannot ship without a help entry.
"""
import re
from pathlib import Path

import pytest

from app.schemas.help import HelpEntry
from app.schemas.matrix_config import MatrixConfigResponse
from app.services.ask_pulse import for_modules
from app.services.help_registry import build_help
from app.services.risk_status import ai_status_thresholds
from app.services.phase_one import _AGING_DAYS, _FRESH_DAYS

FRONTEND = Path(__file__).resolve().parents[2] / "frontend" / "src"

_BASE = dict(
    likelihood_scale=5, impact_scale=5, band_count=4,
    band_1_label="Low", band_2_label="Medium", band_3_label="High", band_4_label="Critical", band_5_label="Extreme",
    band_low_min=1, band_low_max=4, band_medium_min=5, band_medium_max=9, band_high_min=10, band_high_max=16,
    band_critical_min=17, band_critical_max=25, band_extreme_min=21, band_extreme_max=25,
)


def _entries(**over: object) -> list[HelpEntry]:
    return build_help(MatrixConfigResponse(**{**_BASE, **over}))


def _by_id(**over: object) -> dict[str, HelpEntry]:
    return {e.id: e for e in _entries(**over)}


def _text(e: HelpEntry) -> str:
    return " ".join([e.what, e.how or "", *e.steps])


def _read(rel: str) -> str:
    return (FRONTEND / rel).read_text(encoding="utf-8")


needs_frontend = pytest.mark.skipif(not FRONTEND.exists(), reason="frontend source not checked out")


# ── Correctness ───────────────────────────────────────────────────────────────

def test_residual_is_multiplicative_never_subtractive() -> None:
    for e in _entries():
        assert "minus" not in _text(e).lower(), e.id
    assert "Severity × (1 − control effectiveness level ÷ 5)" in (_by_id()["residual-risk"].how or "")


def test_freshness_limits_come_from_the_engine() -> None:
    how = _by_id()["freshness"].how or ""
    assert f"last {_FRESH_DAYS} days" in how
    assert f"Stale at {_AGING_DAYS} days" in how
    assert "30, 60 or 90" not in how


def test_ai_status_thresholds_come_from_the_engine() -> None:
    how = _by_id()["ai-confidence-status"].how or ""
    esc, mon = ai_status_thresholds(MatrixConfigResponse(**_BASE))  # type: ignore[arg-type]
    assert (esc, mon) == (17, 10)
    assert f"level is Critical or residual is {esc} or more" in how
    assert f"level is High or residual is {mon} or more" in how
    assert "**Review** when the level is Medium" in how
    assert "Conservative, Balanced or Assertive" in how


def test_ai_status_help_follows_a_renamed_4x4_matrix() -> None:
    how = _by_id(
        likelihood_scale=4, impact_scale=4, band_count=3,
        band_1_label="Minor", band_2_label="Moderate", band_3_label="Severe",
        band_medium_min=4, band_high_min=9,
    )["ai-confidence-status"].how or ""
    assert "level is Severe or residual is 9 or more" in how
    assert "level is Moderate or residual is 4 or more" in how
    assert "Critical" not in how and "Review" not in how


def test_ai_status_help_on_five_bands_escalates_top_two() -> None:
    how = _by_id(band_count=5)["ai-confidence-status"].how or ""
    assert "level is Critical or Extreme or residual is 17 or more" in how
    assert "level is High or residual is 10 or more" in how
    assert "**Review** when the level is Medium" in how


def test_bands_follow_the_workspace() -> None:
    three = _by_id(band_count=3, band_1_label="Minor", band_2_label="Moderate", band_3_label="Severe")
    assert "Minor, Moderate and Severe" in (three["severity"].how or "")
    assert "1 to 16" in (_by_id(likelihood_scale=4, impact_scale=4)["severity"].how or "")


def test_default_roles_follow_settings_defaults() -> None:
    how = _by_id()["roles-permissions"].how or ""
    # Analysts can print reports by default, and Manage Settings is Admin only.
    assert "Print Reports: Admin, Manager and Analyst" in how
    assert "Manage Settings is always Admin only" in how


def test_how_tos_have_steps() -> None:
    for e in _entries():
        if e.kind == "how-to":
            assert e.steps, e.id


def test_related_ids_exist() -> None:
    ids = {e.id for e in _entries()}
    for e in _entries():
        for r in e.related:
            assert r in ids, f"{e.id} relates to missing {r}"


def test_settings_entries_need_settings_permission() -> None:
    for e in _entries():
        if e.route and e.route.startswith("/settings"):
            assert e.requires == "manage_settings", e.id


# ── Plan modules ──────────────────────────────────────────────────────────────

def test_risk_only_plan_hides_incident_entries() -> None:
    kept = for_modules(_entries(), ["risk"])
    assert all(e.module != "incident" for e in kept)
    assert any(e.module == "risk" for e in kept)


def test_incident_only_plan_hides_risk_entries() -> None:
    kept = for_modules(_entries(), ["incident"])
    assert all(e.module != "risk" for e in kept)
    assert any(e.id == "incident-workflow" for e in kept)


def test_no_module_list_keeps_everything() -> None:
    assert len(for_modules(_entries(), None)) == len(_entries())


# ── Coverage of the app ───────────────────────────────────────────────────────

@needs_frontend
def test_every_settings_tab_has_an_entry() -> None:
    tabs = re.findall(r'\{\s*id:\s*"([a-z-]+)",\s*label:', _read("pages/Settings.tsx"))
    assert tabs, "could not read the settings tabs"
    routes = {e.route for e in _entries() if e.route}
    for tab in tabs:
        assert f"/settings?tab={tab}" in routes, f"no help entry for Settings tab {tab}"


@needs_frontend
def test_every_app_page_has_an_entry() -> None:
    app = _read("App.tsx")
    inner = app[app.index('path="/*"'):]
    paths = set(re.findall(r'<Route path="(/[a-z/-]*)"', inner)) - {"/", "/help"}
    assert paths, "could not read the app routes"
    routes = {e.route.split("?")[0] for e in _entries() if e.route}
    for path in paths:
        assert path in routes, f"no help entry routes to {path}"


@needs_frontend
def test_every_explainer_has_an_entry() -> None:
    ids = {e.id for e in _entries()}
    used: set[str] = set()
    for f in FRONTEND.rglob("*.tsx"):
        used |= set(re.findall(r'<Explain\s+id="([a-z0-9-]+)"', f.read_text(encoding="utf-8")))
    assert used, "no explainers found"
    for i in used:
        assert i in ids, f'<Explain id="{i}"> has no help entry'


@needs_frontend
def test_starter_topics_exist() -> None:
    ids = {e.id for e in _entries()}
    m = re.search(r"HELP_STARTERS = \[(.*?)\]", _read("utils/helpSearch.ts"), re.S)
    assert m
    for i in re.findall(r"'([a-z0-9-]+)'", m.group(1)):
        assert i in ids, f"starter {i} has no entry"


# ── Weekly unanswered-questions report ────────────────────────────────────────

def test_gaps_group_by_question_and_rank_by_volume() -> None:
    from app.services.ask_pulse import summarise_gaps
    rows = [
        ("no_results", "Delete a risk", "t1"), ("no_results", "delete  a risk ", "t2"),
        ("contact", "delete a risk", "t1"), ("no_results", "kri", "t1"),
        ("open", None, "t1"), ("no_results", "   ", "t3"),
    ]
    gaps = summarise_gaps(rows)
    assert [g.query for g in gaps] == ["delete a risk", "kri"]
    top = gaps[0]
    assert (top.searches, top.emailed, top.workspaces) == (2, 1, 2)


def test_gaps_email_escapes_what_users_typed() -> None:
    from app.services.ask_pulse import HelpGap
    from app.services.email import build_help_gaps_html
    html = build_help_gaps_html([HelpGap("<script>x</script>", 1, 0, 1)], 7)
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
