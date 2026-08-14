# app/services/brief.py
# Risk Brief payload builder for v2.
# Translates BriefService.gs api_buildBriefPayload() and all helper functions.
# Called by routes/brief.py (preview/send-test) and scheduler/jobs.py (daily send).

from __future__ import annotations

import urllib.parse
from datetime import date, datetime, timezone, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.incident import Incident
from app.models.risk import Risk
from app.models.tenant import Tenant
from app.schemas.brief import (
    BriefMeta,
    BriefPayload,
    BriefReader,
    BriefTableRow,
    BriefTables,
    DailyException,
    OutreachItem,
    SignalRow,
    WeeklyDigest,
)
from app.services.snapshot import get_daily_deltas

# ── constants ──────────────────────────────────────────────────────────────

_BAND_ORDER = {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}
_HIGH_CRIT   = {"High", "Critical"}

# ── entry point ────────────────────────────────────────────────────────────


async def build_brief_payload(
    db: AsyncSession,
    tenant_id: UUID,
    reader_email: str = "",
    force_enabled: bool = False,
) -> BriefPayload:
    """
    Build the complete brief payload for one tenant.
    Returns BriefPayload(ok=False, skip=True) when the brief is off or has no recipients.
    Source: BriefService.gs api_buildBriefPayload().
    """
    tenant: Tenant | None = (
        await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    ).scalar_one_or_none()

    if tenant is None:
        return BriefPayload(ok=False, skip=True, reason="Workspace not found")

    ws: dict = dict(tenant.workspace_settings or {})  # type: ignore[arg-type]

    if not force_enabled and ws.get("brief_enabled", "off") != "on":
        return BriefPayload(ok=False, skip=True, reason="Brief not enabled")

    # ── fetch data ─────────────────────────────────────────────────────────
    risk_rows = (await db.execute(
        select(Risk).where(Risk.tenant_id == tenant_id, Risk.deleted_at.is_(None))
    )).scalars().all()

    incident_rows = (await db.execute(
        select(Incident).where(Incident.tenant_id == tenant_id, Incident.deleted_at.is_(None))
    )).scalars().all()

    risks     = [_risk_to_dict(r) for r in risk_rows]
    incidents = [_incident_to_dict(i) for i in incident_rows]

    # ── deltas ─────────────────────────────────────────────────────────────
    today     = datetime.now(timezone.utc)
    today_str = today.strftime("%Y-%m-%d")

    last_sent  = str(ws.get("brief_last_sent") or "")
    since_date = last_sent if last_sent else (today - timedelta(days=1)).strftime("%Y-%m-%d")

    since_7d = (today - timedelta(days=7)).strftime("%Y-%m-%d")

    delta_result    = await get_daily_deltas(db, tenant_id, since_date)
    delta_result_7d = await get_daily_deltas(db, tenant_id, since_7d)

    delta_list    = delta_result.get("deltas",    []) if delta_result.get("ok")    else []
    delta_list_7d = delta_result_7d.get("deltas", []) if delta_result_7d.get("ok") else []
    is_warming_up = not delta_result.get("has_data", False)

    # ── cadence and shared metrics ─────────────────────────────────────────
    cadence_sections = _select_cadence_sections(today.date(), ws)
    suppression      = dict(ws.get("brief_suppression", {}))
    control_metrics  = _compute_control_metrics(risks, ws)
    stale_metrics    = _compute_stale_metrics(risks, ws)
    concentration    = _compute_concentration(risks)
    health_now       = _compute_health_score(risks)
    shown: set[str]  = set()

    # ── section builders ───────────────────────────────────────────────────
    sections: dict[str, object] = {}

    if "monthly_posture" in cadence_sections:
        sections["monthly_posture"] = _build_monthly_posture(
            risks, control_metrics, stale_metrics, concentration, shown
        )

    if "quarterly_board_summary" in cadence_sections:
        sections["quarterly_board_summary"] = _build_quarterly_board(
            risks, control_metrics, shown
        )

    if "weekly_digest" in cadence_sections:
        health_prev = _compute_health_score_from_deltas(risks, delta_list_7d)
        sections["weekly_digest"] = _build_weekly_digest(
            risks, delta_list_7d, incidents, stale_metrics,
            suppression, ws, health_now, health_prev, shown
        )

    if "biweekly_owner_accountability" in cadence_sections:
        sections["biweekly_owner_accountability"] = _build_biweekly_accountability(risks, shown)

    daily_section = _build_daily_exception(
        risks, delta_list, incidents, control_metrics, stale_metrics, suppression, ws, shown
    )
    sections["daily_exception"] = daily_section

    _update_suppression(tenant, ws, delta_list, daily_section)
    await db.flush()

    # ── final payload fields ───────────────────────────────────────────────
    tables          = _build_tables(risks, delta_list, ws)
    outreach        = _build_suggested_outreach(risks, delta_list, ws)
    signal_rows     = _build_signal_rows(daily_section, control_metrics, incidents, today)
    rec_action      = _build_recommended_action(daily_section, control_metrics, stale_metrics, outreach)
    first_name      = _first_name_from_email(reader_email) if reader_email else str(ws.get("name") or "there")
    workspace_name  = str(tenant.name or "SmartRisk")

    weekly_obj: WeeklyDigest | None = None
    if isinstance(sections.get("weekly_digest"), dict):
        wd: dict = sections["weekly_digest"]  # type: ignore[assignment]
        weekly_obj = WeeklyDigest(
            health_wow=float(wd.get("healthWow") or 0),
            health_now=float(wd.get("healthNow") or 0),
            health_prev=float(wd.get("healthPrev") or 0),
            top_movers_count=len(wd.get("topMovers") or []),
            overdue_reviews_count=len(wd.get("overdueReviews") or []),
            overdue_actions_count=len(wd.get("overdueActions") or []),
        )

    return BriefPayload(
        ok=True,
        reader=BriefReader(first_name=first_name, email=reader_email),
        meta=BriefMeta(
            cadence_sections=cadence_sections,
            workspace_name=workspace_name,
            is_warming_up=is_warming_up,
            generated_at=today.isoformat(),
        ),
        greeting=_get_greeting(today),
        residual_change_summary=_build_preheader(daily_section, risks),
        critical_count=sum(1 for r in risks if r["level"].lower() == "critical"),
        signal_rows=signal_rows,
        recommended_action=rec_action,
        tables=tables,
        outreach=outreach,
        daily_exception=DailyException(
            is_empty=daily_section["isEmpty"],
            empty_message=daily_section.get("emptyMessage"),
            item_count=len(daily_section["items"]),
        ),
        weekly=weekly_obj,
    )


# ── cadence engine ─────────────────────────────────────────────────────────

def _select_cadence_sections(today: date, ws: dict) -> list[str]:
    """Source: BriefService.gs _selectCadenceSections_."""
    sections: list[str] = ["daily_exception"]

    dow      = today.weekday()   # 0=Mon in Python (GAS: 0=Sun, 1=Mon)
    is_monday = dow == 0

    if is_monday and ws.get("brief_weekly_enabled", True):
        sections.append("weekly_digest")

    if is_monday and _iso_week(today) % 2 == 0:
        sections.append("biweekly_owner_accountability")

    if ws.get("brief_monthly_enabled", True) and _is_first_business_day(today):
        sections.append("monthly_posture")

    month = today.month
    if (ws.get("brief_quarterly_enabled", True)
            and _is_first_business_day(today)
            and month in {1, 4, 7, 10}):
        sections.append("quarterly_board_summary")

    sections.reverse()
    return sections


# ── section builders ───────────────────────────────────────────────────────

def _build_daily_exception(
    risks: list[dict],
    deltas: list[dict],
    incidents: list[dict],
    control_metrics: dict,
    stale_metrics: dict,
    suppression: dict,
    ws: dict,
    shown: set[str],
) -> dict:
    """Source: BriefService.gs _buildDailyException_."""
    items: list[dict]         = []
    persist_items: list[dict] = []

    for d in deltas:
        if d["type"] == "band_crossing":
            key = f"crossing_{d['riskId']}"
            if key not in shown:
                items.append({"type": "band_crossing", **d})
                shown.add(key)

    for d in deltas:
        if d["type"] == "new" and d.get("band") in _HIGH_CRIT:
            key = f"new_{d['riskId']}"
            if key not in shown:
                items.append({"type": "net_new_critical", **d})
                shown.add(key)

    if control_metrics["failed"] and "control_fail" not in shown:
        items.append({"type": "control_fail", "count": len(control_metrics["failed"])})
        shown.add("control_fail")

    for r in stale_metrics["staleHighCrit"]:
        key = f"stale_hc_{r['id']}"
        if key in shown:
            continue
        if _is_risk_suppressed(suppression, r["id"]):
            persist_items.append(r)
            continue
        shown.add(key)
        items.append({"type": "stale_high_crit", "risk": r})

    for d in deltas:
        if d["type"] == "score_change" and (d.get("residualDelta") or 0) != 0:
            key = f"score_{d['riskId']}"
            if key not in shown:
                items.append({"type": "score_change", **d})
                shown.add(key)

    this_month = datetime.now(timezone.utc).strftime("%Y-%m")
    recent_inc = [
        i for i in incidents
        if str(i.get("reported_at") or i.get("date_reported") or "").startswith(this_month)
    ]
    if recent_inc and "incidents" not in shown:
        items.append({"type": "incident", "count": len(recent_inc), "incidents": recent_inc[:3]})
        shown.add("incidents")

    is_empty = len(items) == 0
    empty_message: str | None = None
    if is_empty:
        small = _smallest_open_obligation(risks, stale_metrics)
        empty_message = "No material movement since your last brief. " + small

    return {"items": items, "persistItems": persist_items, "isEmpty": is_empty, "emptyMessage": empty_message}


def _build_weekly_digest(
    risks: list[dict],
    deltas7d: list[dict],
    incidents: list[dict],
    stale_metrics: dict,
    suppression: dict,
    ws: dict,
    health_now: float,
    health_prev: float,
    shown: set[str],
) -> dict:
    """Source: BriefService.gs _buildWeeklyDigest_."""
    health_wow = round(health_now - health_prev, 1)

    top_movers = sorted(
        [d for d in deltas7d if d.get("residualDelta") not in (None, 0)],
        key=lambda d: abs(d.get("residualDelta") or 0),
        reverse=True,
    )[:3]
    for d in top_movers:
        shown.add(f"score_{d['riskId']}")
        shown.add(f"crossing_{d['riskId']}")

    today = date.today()
    threshold = int(ws.get("brief_stale_threshold") or 30)

    overdue_reviews = sorted(
        [
            {"id": r["id"], "desc": r["description"], "owner": r["owner"],
             "daysOverdue": _days_since(r.get("last_reviewed_at") or r.get("logged_at"))}
            for r in risks
            if f"stale_hc_{r['id']}" not in shown
            and _days_since(r.get("last_reviewed_at") or r.get("logged_at")) >= 30
        ],
        key=lambda x: x["daysOverdue"],
        reverse=True,
    )[:10]

    overdue_actions = sorted(
        [
            {"id": r["id"], "desc": r["description"], "owner": r["owner"],
             "targetDate": str(r["target_date"]),
             "daysPast": (today - r["target_date"]).days}
            for r in risks
            if r.get("target_date")
            and isinstance(r["target_date"], date)
            and r["target_date"] < today
            and r.get("mitigation_status") in ("Open", "In Progress")
        ],
        key=lambda x: x["daysPast"],
        reverse=True,
    )

    return {
        "healthWow":            health_wow,
        "healthNow":            health_now,
        "healthPrev":           health_prev,
        "topMovers":            top_movers,
        "overdueReviews":       overdue_reviews,
        "overdueActions":       overdue_actions,
        "persistentIssues":     _risks_for_persistent_issues(suppression, risks),
        "staleWatchlist":       stale_metrics["stale30"][:5],
    }


def _build_biweekly_accountability(risks: list[dict], shown: set[str]) -> dict:
    """Source: BriefService.gs _buildBiweeklyAccountability_."""
    today = date.today()
    owner_map: dict[str, dict] = {}

    for r in risks:
        if _days_since(r.get("last_reviewed_at") or r.get("logged_at")) >= 30:
            owner = r["owner"] or "Unassigned"
            owner_map.setdefault(owner, {"owner": owner, "overdueReviews": 0, "overdueActions": 0})
            owner_map[owner]["overdueReviews"] += 1

    for r in risks:
        td = r.get("target_date")
        if (td and isinstance(td, date) and td < today
                and r.get("mitigation_status") in ("Open", "In Progress")):
            owner = r["owner"] or "Unassigned"
            owner_map.setdefault(owner, {"owner": owner, "overdueReviews": 0, "overdueActions": 0})
            owner_map[owner]["overdueActions"] += 1

    unowned_hc = [r for r in risks if not r["owner"] and r["level"] in _HIGH_CRIT]
    owner_list = sorted(
        owner_map.values(),
        key=lambda o: o["overdueReviews"] + o["overdueActions"],
        reverse=True,
    )
    return {"ownerList": owner_list, "unownedHighCrit": unowned_hc}


def _build_monthly_posture(
    risks: list[dict],
    control_metrics: dict,
    stale_metrics: dict,
    concentration: dict,
    shown: set[str],
) -> dict:
    """Source: BriefService.gs _buildMonthlyPosture_."""
    band_counts: dict[str, int] = {"Low": 0, "Medium": 0, "High": 0, "Critical": 0}
    for r in risks:
        b = r["level"].capitalize() if r["level"] else ""
        if b in band_counts:
            band_counts[b] += 1

    tested   = sum(1 for r in risks if r.get("control_test_result") and r["control_test_result"] != "Not Tested")
    coverage = round((tested / len(risks)) * 100) if risks else 0

    shown.add("control_fail")
    for r in stale_metrics["staleHighCrit"]:
        shown.add(f"stale_hc_{r['id']}")

    return {
        "bandCounts":      band_counts,
        "controlCoverage": coverage,
        "failedControls":  len(control_metrics["failed"]),
        "overdueControls": len(control_metrics["overdue"]),
        "concentration":   concentration["flags"],
        "stale30Count":    len(stale_metrics["stale30"]),
        "stale60Count":    len(stale_metrics["stale60"]),
        "stale90Count":    len(stale_metrics["stale90"]),
        "totalRisks":      len(risks),
    }


def _build_quarterly_board(risks: list[dict], control_metrics: dict, shown: set[str]) -> dict:
    """Source: BriefService.gs _buildQuarterlyBoard_."""
    band_counts: dict[str, int] = {"Low": 0, "Medium": 0, "High": 0, "Critical": 0}
    for r in risks:
        b = r["level"].capitalize() if r["level"] else ""
        if b in band_counts:
            band_counts[b] += 1

    top_drivers = sorted(risks, key=lambda r: r["residual"] or 0, reverse=True)[:5]
    shown.add("control_fail")

    tested   = sum(1 for r in risks if r.get("control_test_result") and r["control_test_result"] != "Not Tested")
    coverage = round((tested / len(risks)) * 100) if risks else 0

    return {
        "bandCounts":      band_counts,
        "topDrivers":      [{"id": r["id"], "description": r["description"], "level": r["level"],
                              "residual": r["residual"], "owner": r["owner"]} for r in top_drivers],
        "totalRisks":      len(risks),
        "failedControls":  len(control_metrics["failed"]),
        "controlCoverage": coverage,
    }


# ── metric computers ───────────────────────────────────────────────────────

def _compute_control_metrics(risks: list[dict], ws: dict) -> dict:
    """Source: BriefService.gs _computeControlMetrics_."""
    interval = int(ws.get("brief_testing_interval") or 90)
    today    = date.today()

    failed = [r for r in risks if str(r.get("control_test_result") or "").lower() == "fail"]

    overdue = [
        r for r in risks
        if (not r.get("control_last_tested") and r["level"] in _HIGH_CRIT)
        or (isinstance(r.get("control_last_tested"), date)
            and (today - r["control_last_tested"]).days > interval)
    ]

    untested_hc = [
        r for r in risks
        if r["level"] in _HIGH_CRIT
        and (not r.get("control_test_result") or r["control_test_result"] == "Not Tested")
    ]

    return {"failed": failed, "overdue": overdue, "untestedHighCrit": untested_hc}


def _compute_stale_metrics(risks: list[dict], ws: dict) -> dict:
    """Source: BriefService.gs _computeStaleMetrics_."""
    threshold = int(ws.get("brief_stale_threshold") or 30)
    today     = date.today()

    stale30: list[dict] = []
    stale60: list[dict] = []
    stale90: list[dict] = []

    for r in risks:
        days = _days_since(r.get("last_reviewed_at") or r.get("logged_at"))
        entry = {**r, "daysSinceReview": days}
        if days >= 90:
            stale90.append(entry)
        elif days >= 60:
            stale60.append(entry)
        elif days >= threshold:
            stale30.append(entry)

    all_stale    = stale90 + stale60 + stale30
    stale_hc     = [r for r in all_stale if r["level"] in _HIGH_CRIT]
    overdue_acts = [
        r for r in risks
        if isinstance(r.get("target_date"), date)
        and r["target_date"] < today
        and r.get("mitigation_status") in ("Open", "In Progress")
    ]

    return {
        "stale30":       stale30,
        "stale60":       stale60,
        "stale90":       stale90,
        "staleHighCrit": stale_hc,
        "overdueActions": overdue_acts,
    }


def _compute_concentration(risks: list[dict]) -> dict:
    """Source: BriefService.gs _computeConcentration_."""
    hc = [r for r in risks if r["level"] in _HIGH_CRIT]
    by_owner: dict[str, int]    = {}
    by_category: dict[str, int] = {}
    for r in hc:
        if r.get("owner"):
            by_owner[r["owner"]] = by_owner.get(r["owner"], 0) + 1
        if r.get("category"):
            by_category[r["category"]] = by_category.get(r["category"], 0) + 1

    flags: list[dict] = []
    for owner, n in by_owner.items():
        if n >= 2:
            flags.append({"type": "owner", "label": owner, "count": n})
    for cat, n in by_category.items():
        if n >= 2:
            flags.append({"type": "category", "label": cat, "count": n})

    return {"flags": flags}


def _compute_health_score(risks: list[dict]) -> float:
    """Source: BriefService.gs _computeHealthScore_."""
    if not risks:
        return 100.0
    avg     = sum(r["residual"] or 0 for r in risks) / len(risks)
    hc_pct  = sum(1 for r in risks if r["level"] in _HIGH_CRIT) / len(risks)
    score   = 100 - (avg / 25) * 50 - hc_pct * 50
    return float(max(0, min(100, round(score, 1))))


def _compute_health_score_from_deltas(risks: list[dict], deltas: list[dict]) -> float:
    """Source: BriefService.gs _computeHealthScoreFromDeltas_."""
    if not deltas:
        return _compute_health_score(risks)
    delta_map = {d["riskId"]: d.get("residualDelta") or 0 for d in deltas}
    baseline  = [
        {**r, "residual": (r["residual"] or 0) - delta_map.get(r["id"], 0)}
        for r in risks
    ]
    return _compute_health_score(baseline)


# ── tables ─────────────────────────────────────────────────────────────────

def _build_tables(risks: list[dict], deltas: list[dict], ws: dict) -> BriefTables:
    """Source: BriefService.gs _buildTables_."""
    delta_map = {d["riskId"]: d for d in deltas}
    threshold = int(ws.get("brief_stale_threshold") or 30)

    volatile = sorted(
        [r for r in risks if r["id"] in delta_map],
        key=lambda r: abs(delta_map[r["id"]].get("residualDelta") or 0),
        reverse=True,
    )[:3]

    high_crit = sorted(
        [r for r in risks if r["level"] in _HIGH_CRIT],
        key=lambda r: r["residual"] or 0,
        reverse=True,
    )[:3]

    stale = sorted(
        [r for r in risks if _days_since(r.get("last_reviewed_at") or r.get("logged_at")) >= threshold],
        key=lambda r: _days_since(r.get("last_reviewed_at") or r.get("logged_at")),
        reverse=True,
    )[:3]

    def _hc_action(r: dict) -> str:
        if not r.get("owner"):
            return "Unowned — assign an owner before the next committee meeting."
        if str(r.get("control_test_result") or "").lower() == "fail":
            return "Control failed testing — open the register to set a remediation date."
        days_rev = _days_since(r.get("last_reviewed_at") or r.get("logged_at"))
        if days_rev > 60:
            return f"Controls unreviewed for {days_rev} days — open the register to re-attest."
        if str(r.get("level") or "").lower() == "critical":
            return "Critical exposure — open the register to confirm escalation and mitigation plan."
        return "Open the register to review mitigation status and update control effectiveness."

    return BriefTables(
        volatile=[
            BriefTableRow(
                id=r["id"],
                description=r["description"],
                level=r["level"],
                delta=delta_map[r["id"]].get("residualDelta"),
            )
            for r in volatile
        ],
        high_critical=[
            BriefTableRow(
                id=r["id"],
                description=r["description"],
                level=r["level"],
                days_logged=_days_since(r.get("logged_at")),
                days_since_review=_days_since(r.get("last_reviewed_at") or r.get("logged_at")),
                action=_hc_action(r),
            )
            for r in high_crit
        ],
        stale=[
            BriefTableRow(id=r["id"], description=r["description"], level=r["level"])
            for r in stale
        ],
    )


# ── signal rows ────────────────────────────────────────────────────────────

def _build_signal_rows(daily: dict, control_metrics: dict, incidents: list[dict], now: datetime) -> list[SignalRow]:
    """Source: BriefService.gs _buildSignalRows_."""
    rows: list[SignalRow] = []

    crossings   = [i for i in daily["items"] if i["type"] == "band_crossing"]
    score_changes = [i for i in daily["items"] if i["type"] == "score_change"]
    total_delta = sum(i.get("residualDelta") or 0 for i in score_changes)

    if crossings:
        up = [c for c in crossings if c.get("bandDirection") == "up"]
        if up:
            rows.append(SignalRow(
                type="band_crossing",
                exposure_delta=float(len(up)),
                exposure_driver=", ".join(c["riskId"] for c in up) + " crossed up",
            ))
    elif total_delta != 0:
        driver = _top_delta_driver(score_changes)
        rows.append(SignalRow(
            type="exposure_up" if total_delta > 0 else "exposure_down",
            exposure_delta=abs(total_delta),
            exposure_driver=driver,
        ))

    if control_metrics["failed"] and len(rows) < 4:
        rows.append(SignalRow(type="control_fail", failed_controls=len(control_metrics["failed"])))

    if control_metrics["overdue"] and len(rows) < 4:
        rows.append(SignalRow(type="control_overdue", failed_controls=len(control_metrics["overdue"])))

    this_month = now.strftime("%Y-%m")
    recent_inc = [i for i in incidents if str(i.get("reported_at") or "").startswith(this_month)]
    if recent_inc and len(rows) < 4:
        areas = list({i.get("category") or "" for i in recent_inc if i.get("category")})
        rows.append(SignalRow(
            type="incident",
            incident_count=len(recent_inc),
            incident_area=" / ".join(areas[:2]) or "General",
        ))

    return rows[:4]


# ── recommended action ─────────────────────────────────────────────────────

def _build_recommended_action(
    daily: dict,
    control_metrics: dict,
    stale_metrics: dict,
    outreach: list[OutreachItem],
) -> str:
    """Source: BriefService.gs _buildRecommendedAction_."""
    parts: list[str] = []

    band_up = [i for i in daily["items"] if i["type"] == "band_crossing" and i.get("bandDirection") == "up"]
    if band_up:
        n = len(band_up)
        parts.append(f"{n} risk{'s' if n > 1 else ''} crossed to a higher band — confirm mitigation plans are in place")

    if control_metrics["failed"]:
        n = len(control_metrics["failed"])
        parts.append(f"address {n} failed control{'s' if n > 1 else ''} before next review")

    if stale_metrics["overdueActions"]:
        n = len(stale_metrics["overdueActions"])
        parts.append(f"chase {n} overdue action{'s' if n > 1 else ''} past their target date")

    if control_metrics["untestedHighCrit"]:
        n = len(control_metrics["untestedHighCrit"])
        parts.append(f"schedule testing for {n} High/Critical risk{'s' if n > 1 else ''} with untested controls")

    if not parts and outreach:
        parts.append(outreach[0].message)

    if not parts:
        return "No immediate actions required — monitor for changes."

    return ". ".join(parts[:2]) + "."


# ── suggested outreach ─────────────────────────────────────────────────────

def _build_suggested_outreach(risks: list[dict], deltas: list[dict], ws: dict) -> list[OutreachItem]:
    """Source: BriefService.gs _buildSuggestedOutreach_."""
    cap       = int(ws.get("brief_outreach_cap") or 5)
    today     = date.today()
    delta_map = {d["riskId"]: d for d in deltas}
    items: list[dict] = []

    for r in risks:
        rid   = r["id"]
        level = str(r.get("level") or "").lower()
        is_hc = level in {"high", "critical"}
        owner = r.get("owner") or ""
        email = r.get("owner_email") or ""
        d     = delta_map.get(rid)

        if d and d.get("bandCrossed") and d.get("bandDirection") == "up" and is_hc:
            items.append(_outreach_entry(owner, email, rid, "crossed_to_" + level,
                         f"Confirm mitigation plan for {rid} — now {r['level']}."))

        if _days_since(r.get("last_reviewed_at") or r.get("logged_at")) > 30 and is_hc:
            days = _days_since(r.get("last_reviewed_at") or r.get("logged_at"))
            items.append(_outreach_entry(owner, email, rid, "overdue_review",
                         f"Re-attest {rid} — review overdue {days} days."))

        if str(r.get("control_test_result") or "").lower() == "fail":
            items.append(_outreach_entry(owner, email, rid, "control_fail",
                         f"Control on {rid} failed testing — set a remediation date."))

        if not owner and is_hc:
            items.append(_outreach_entry("Risk Team", "", rid, "unowned_high_crit",
                         f"Assign an owner to {rid} before committee."))

        td = r.get("target_date")
        if isinstance(td, date) and td < today and r.get("mitigation_status") in ("Open", "In Progress"):
            days_past = (today - td).days
            items.append(_outreach_entry(owner, email, rid, "overdue_action",
                         f"Overdue action on {rid} — target date passed {days_past} days ago."))

    # Concentration flags
    by_owner: dict[str, dict] = {}
    for r in risks:
        if r["level"] in _HIGH_CRIT and r.get("owner"):
            key = r["owner"]
            by_owner.setdefault(key, {"count": 0, "email": r.get("owner_email") or ""})
            by_owner[key]["count"] += 1
    for owner, data in by_owner.items():
        if data["count"] >= 2:
            items.append(_outreach_entry(owner, data["email"], None, "concentration",
                         f"You now hold {data['count']} High/Critical risks — review load with risk team."))

    order = {"crossed_to_critical": 0, "control_fail": 1, "overdue_review": 2,
             "concentration": 3, "overdue_action": 4, "unowned_high_crit": 5}
    items.sort(key=lambda x: order.get(x["reason"], 9))

    seen: set[str] = set()
    deduped: list[dict] = []
    for item in items:
        key = f"{item.get('riskId') or ''}_{item['reason']}"
        if key not in seen:
            seen.add(key)
            deduped.append(item)

    return [
        OutreachItem(
            owner_name=item["ownerName"],
            risk_id=item.get("riskId"),
            reason=item["reason"],
            message=item["message"],
            mailto=item.get("mailto"),
        )
        for item in deduped[:cap]
    ]


def _outreach_entry(owner: str, email: str, risk_id: str | None, reason: str, message: str) -> dict:
    subject = urllib.parse.quote(f"{risk_id} — {reason.replace('_', ' ')}" if risk_id else "SmartRisk action required")
    body    = urllib.parse.quote(message)
    mailto  = f"mailto:{email}?subject={subject}&body={body}" if email else None
    return {"ownerName": owner or "Risk Team", "ownerEmail": email, "riskId": risk_id,
            "reason": reason, "message": message, "mailto": mailto}


# ── suppression ────────────────────────────────────────────────────────────

def _is_risk_suppressed(suppression: dict, risk_id: str) -> bool:
    return int(suppression.get(risk_id, 0)) >= 2


def _risks_for_persistent_issues(suppression: dict, risks: list[dict]) -> list[dict]:
    suppressed = {k for k, v in suppression.items() if int(v) >= 2}
    return [r for r in risks if r["id"] in suppressed]


def _update_suppression(tenant: Tenant, ws: dict, deltas: list[dict], daily: dict) -> None:
    """Update suppression counts and persist back to workspace_settings."""
    suppression: dict = dict(ws.get("brief_suppression", {}))
    changed_ids = {d["riskId"] for d in deltas}

    for rid in changed_ids:
        suppression.pop(rid, None)

    for item in daily["items"]:
        if item["type"] == "stale_high_crit":
            rid = item.get("risk", {}).get("id")
            if rid:
                suppression[rid] = suppression.get(rid, 0) + 1

    existing: dict = dict(tenant.workspace_settings or {})  # type: ignore[arg-type]
    existing["brief_suppression"] = suppression
    tenant.workspace_settings = existing  # type: ignore[assignment]


# ── helpers ────────────────────────────────────────────────────────────────

def _is_first_business_day(today: date) -> bool:
    """Source: BriefService.gs _isFirstBusinessDay_."""
    dow = today.weekday()  # 0=Mon
    if dow >= 5:
        return False
    day = today.day
    if day == 1:
        return True
    # Was 1st a weekend?
    first     = date(today.year, today.month, 1)
    first_dow = first.weekday()
    if first_dow == 5 and day == 3 and dow == 0:  # Sat 1st → Mon 3rd
        return True
    if first_dow == 6 and day == 2 and dow == 0:  # Sun 1st → Mon 2nd
        return True
    return False


def _iso_week(d: date) -> int:
    """Source: BriefService.gs _getISOWeek_."""
    return d.isocalendar().week


def _days_since(val: object) -> int:
    """Source: BriefService.gs _daysSinceField_. Returns 9999 for None/invalid."""
    if val is None:
        return 9999
    if isinstance(val, datetime):
        val = val.date()
    if isinstance(val, date):
        return (date.today() - val).days
    try:
        parsed = datetime.fromisoformat(str(val)).date()
        return (date.today() - parsed).days
    except (ValueError, TypeError):
        return 9999


def _get_greeting(now: datetime) -> str:
    hour = now.hour
    if hour < 12:
        return "Good morning"
    if hour < 17:
        return "Good afternoon"
    return "Good evening"


def _first_name_from_email(email: str) -> str:
    if not email:
        return "there"
    local = email.split("@")[0]
    part  = local.replace(".", " ").replace("_", " ").replace("-", " ").split()[0]
    return part.capitalize() if part else "there"


def _top_delta_driver(score_changes: list[dict]) -> str:
    if not score_changes:
        return "residual shift"
    top = max(score_changes, key=lambda d: abs(d.get("residualDelta") or 0))
    return f"driven by {top['riskId']}" if top.get("riskId") else "residual shift"


def _build_preheader(daily: dict, risks: list[dict]) -> str:
    if daily["isEmpty"]:
        return "no material movement overnight"
    crossings = sum(1 for i in daily["items"] if i["type"] == "band_crossing")
    if crossings:
        return f"{crossings} risk{'s' if crossings > 1 else ''} changed band overnight"
    crit = sum(1 for r in risks if str(r.get("level") or "").lower() == "critical")
    return f"{crit} Critical risk{'s' if crit != 1 else ''} require attention"


def _smallest_open_obligation(risks: list[dict], stale_metrics: dict) -> str:
    if stale_metrics["overdueActions"]:
        n = len(stale_metrics["overdueActions"])
        return f"{n} action{'s' if n > 1 else ''} overdue."
    stale_count = len(stale_metrics["stale30"]) + len(stale_metrics["stale60"]) + len(stale_metrics["stale90"])
    if stale_count:
        return f"{stale_count} review{'s' if stale_count > 1 else ''} still due."
    hc = sum(1 for r in risks if r.get("level") in _HIGH_CRIT)
    return f"{hc} High/Critical risk{'s' if hc != 1 else ''} in register."


# ── ORM to dict converters ─────────────────────────────────────────────────

def _risk_to_dict(r: Risk) -> dict:
    """Convert ORM Risk to plain dict for brief computation. Avoids Column attr issues."""
    td = r.target_date  # type: ignore[union-attr]
    lr = r.last_reviewed_at  # type: ignore[union-attr]
    cl = r.control_last_tested  # type: ignore[union-attr]
    return {
        "id":                   str(r.id),
        "description":          str(r.description or ""),
        "category":             str(r.category or ""),
        "level":                str(r.level or ""),
        "residual":             float(r.residual or 0),  # type: ignore[arg-type]
        "owner":                str(r.owner or ""),
        "owner_email":          str(r.owner_email or ""),
        "control_test_result":  str(r.control_test_result or ""),
        "control_last_tested":  cl.date() if isinstance(cl, datetime) else (cl if isinstance(cl, date) else None),  # type: ignore[union-attr]
        "control_effectiveness": float(r.control_effectiveness or 0),  # type: ignore[arg-type]
        "mitigation_status":    str(r.mitigation_status or ""),
        "target_date":          td if isinstance(td, date) else None,
        "last_reviewed_at":     lr.date() if isinstance(lr, datetime) else None,
        "logged_at":            r.logged_at,  # type: ignore[union-attr]
    }


def _incident_to_dict(i: Incident) -> dict:
    return {
        "id":          str(i.id),
        "category":    str(i.category or ""),
        "reported_at": str(i.reported_at or ""),
        "status":      str(i.status or ""),
    }