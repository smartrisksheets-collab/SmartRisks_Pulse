"""
Home service: the 60-second view.

Builds on get_dashboard() so Home and Analytics always show the same figures,
then adds what only Home needs: the verdict sentence, the four tiles, the most
urgent actions, tagged top risks and open incidents, and the setup flags.
"""

from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.appetite_threshold import AppetiteThreshold
from app.models.incident import Incident
from app.models.risk import Risk
from app.models.tenant import Tenant
from app.models.workspace_member import WorkspaceMember
from app.schemas.dashboard import DashboardResponse, RecommendedAction
from app.schemas.home import (
    HomeAction,
    HomeFocus,
    HomeIncidentRow,
    HomeResponse,
    HomeRiskRow,
    HomeSetup,
    HomeTile,
    HomeTiles,
)
from app.services.dashboard import get_dashboard
from app.services.incident_severity import (
    _OPEN_STATUSES as OPEN_STATUSES,
    get_severity_ranks,
    high_severity_labels,
)
from app.services.risk_status import appetite_status, is_past_target, is_undecided, threshold_for

_LIST_LIMIT = 3
_FEED_LIMIT = 5
_TITLE_MAX = 80

# Most urgent first. A key not listed sorts after these, in its original order.
_ACTION_RANK = [
    "appetite_breach",
    "link_missed",
    "cover_",
    "undecided",
    "past_target",
    "retest_contradicted",
    "review_materialised",
    "evidence_high",
    "triage_linkage",
    "independent_testing",
]
_RISK_KEYS = {
    "appetite_breach", "undecided", "past_target",
    "retest_contradicted", "review_materialised", "evidence_high",
}


def _rank(key: str) -> int:
    for i, k in enumerate(_ACTION_RANK):
        if key == k or (k.endswith("_") and key.startswith(k)):
            return i
    return len(_ACTION_RANK)


def _target_kind(a: RecommendedAction) -> str:
    if a.key in _RISK_KEYS and a.refs:
        return "risk" if len(a.refs) == 1 else "risks"
    if a.key == "link_missed" and a.refs:
        return "incident" if len(a.refs) == 1 else "incidents"
    if a.key.startswith("cover_") and a.refs:
        return "category"
    return "none"


def _plural(n: int, one: str, many: str) -> str:
    return one if n == 1 else many


def _short(text: str | None) -> str | None:
    if not text:
        return None
    t = " ".join(str(text).split())
    return t if len(t) <= _TITLE_MAX else t[: _TITLE_MAX - 1].rstrip() + "…"


def _day(d: date | None) -> str | None:
    return f"{d.day} {d.strftime('%b')}" if d else None


def merge_actions(data: DashboardResponse) -> list[HomeAction]:
    """Every recommended action across Analytics, once each, most urgent first."""
    seen: set[str] = set()
    merged: list[RecommendedAction] = []
    for a in [
        *data.pressure.actions,
        *data.correlation.unlinked_actions,
        *data.correlation.materialised_actions,
        *data.control_evidence.actions,
    ]:
        if a.key in seen:
            continue
        seen.add(a.key)
        merged.append(a)
    ordered = sorted(enumerate(merged), key=lambda p: (_rank(p[1].key), p[0]))
    return [HomeAction(**a.model_dump(), target_kind=_target_kind(a)) for _, a in ordered]


async def get_home(
    db: AsyncSession,
    tenant_id: UUID,
    account_id: UUID | None,
    modules: list[str],
) -> HomeResponse:
    has_risk = "risk" in modules
    has_incident = "incident" in modules
    today = date.today()

    data = await get_dashboard(db, tenant_id)
    health, pressure, corr = data.enterprise_health, data.pressure, data.correlation

    workspace = (await db.execute(select(Tenant.name).where(Tenant.id == tenant_id))).scalar_one_or_none() or ""
    first_name: str | None = None
    if account_id is not None:
        full = (await db.execute(select(Account.name).where(Account.id == account_id))).scalar_one_or_none()
        parts = str(full or "").split()
        first_name = parts[0] if parts else None

    members = int((await db.execute(
        select(func.count(WorkspaceMember.id)).where(
            WorkspaceMember.tenant_id == tenant_id,
            WorkspaceMember.status != "DEACTIVATED",
        )
    )).scalar_one() or 0)

    # ── Risks with their tags ────────────────────────────────────────────────
    thresholds: dict[str, float] = {
        str(t.category): float(t.threshold)
        for t in (await db.execute(
            select(AppetiteThreshold.category, AppetiteThreshold.threshold)
            .where(AppetiteThreshold.tenant_id == tenant_id)
        )).all()
        if t.category is not None and t.threshold is not None
    }
    risks = (await db.execute(
        select(
            Risk.id, Risk.description, Risk.category, Risk.owner, Risk.residual, Risk.level,
            Risk.is_elevated, Risk.linked_decision, Risk.mitigation_status, Risk.target_date,
        ).where(Risk.tenant_id == tenant_id, Risk.deleted_at.is_(None))
    )).all() if has_risk else []

    risk_rows: list[tuple[float, HomeRiskRow]] = []
    exceeding: list[tuple[float, Any]] = []
    for r in risks:
        residual = float(r.residual) if r.residual is not None else None
        threshold = threshold_for(str(r.category) if r.category is not None else None, thresholds)
        ap = appetite_status(residual, threshold)
        tags: list[str] = []
        if ap == "exceeds":
            tags.append("Outside appetite")
            exceeding.append((residual - threshold if residual is not None and threshold is not None else 0.0, r))
        if is_undecided(
            is_elevated=bool(r.is_elevated), appetite=ap,
            linked_decision=r.linked_decision, mitigation_status=r.mitigation_status,
        ):
            tags.append("No decision yet")
        if is_past_target(target_date=r.target_date, mitigation_status=r.mitigation_status, today=today):
            tags.append("Past target date")
        if residual is not None:
            risk_rows.append((residual, HomeRiskRow(
                id=str(r.id), title=_short(r.description), level=r.level, residual=residual, tags=tags,
            )))
    risk_rows.sort(key=lambda p: (-p[0], p[1].id))
    exceeding.sort(key=lambda p: -p[0])

    # ── Open incidents with their tags ───────────────────────────────────────
    sev_rank = await get_severity_ranks(db, tenant_id)
    high_set = set(high_severity_labels(sev_rank))
    incidents = (await db.execute(
        select(
            Incident.id, Incident.title, Incident.severity, Incident.status,
            Incident.category, Incident.linked_risk_id, Incident.reported_at,
        ).where(
            Incident.tenant_id == tenant_id,
            Incident.deleted_at.is_(None),
            Incident.status.in_(OPEN_STATUSES),
        )
    )).all() if has_incident else []
    uncovered = set(corr.uncovered_categories) if has_risk else set()
    inc_rows: list[tuple[int, date, HomeIncidentRow]] = []
    unlinked_open = unlinked_high = 0
    for i in incidents:
        linked = bool(str(i.linked_risk_id or "").strip())
        tags = []
        if i.category and str(i.category) in uncovered:
            tags.append(f"{i.category}: no risk line")
        elif not linked and has_risk:
            tags.append("No linked risk")
        if not linked:
            unlinked_open += 1
            unlinked_high += int(str(i.severity or "") in high_set)
        inc_rows.append((
            sev_rank.get(str(i.severity or ""), len(sev_rank)),
            i.reported_at or today,
            HomeIncidentRow(id=str(i.id), title=_short(i.title), severity=i.severity, status=i.status, tags=tags),
        ))
    inc_rows.sort(key=lambda p: (p[0], p[1], p[2].id))

    # ── Actions, focus and verdict ───────────────────────────────────────────
    actions = merge_actions(data) if has_risk else []
    focus: HomeFocus | None = None
    for a in actions:
        if a.target_kind in ("risk", "incident"):
            focus = HomeFocus(kind=a.target_kind, id=a.refs[0])
            break

    status = health.status if has_risk else ""
    reasons: list[str] = []
    n_exc = pressure.exceeds_appetite if has_risk else 0
    if n_exc:
        reasons.append(f"{n_exc} {_plural(n_exc, 'risk sits', 'risks sit')} outside appetite")
    if has_risk and unlinked_high:
        reasons.append(
            "a high-severity incident has no matching risk" if unlinked_high == 1
            else f"{unlinked_high} high-severity incidents have no matching risk"
        )
    if not reasons and has_risk and pressure.past_target:
        n = pressure.past_target
        reasons.append(f"{n} {_plural(n, 'treatment is', 'treatments are')} past target date")
    if not reasons and has_incident and pressure.open_high:
        n = pressure.open_high
        reasons.append(f"{n} high-severity {_plural(n, 'incident is', 'incidents are')} open")

    if status and status != "No data":
        verdict = f"{workspace} is {status}."
    elif has_incident:
        n = pressure.open_incidents
        verdict = f"{workspace} has {n} open {_plural(n, 'incident', 'incidents')}."
    else:
        verdict = f"{workspace} has no scored risks yet."
    if reasons:
        sentence = " and ".join(reasons)
        verdict += f" {sentence[0].upper()}{sentence[1:]}."
        if focus is not None:
            verdict += f" Start with {focus.id}."
    elif status in ("Healthy", "Monitoring"):
        verdict += " Nothing needs urgent action right now."

    # ── Tiles ────────────────────────────────────────────────────────────────
    health_note = f"{health.confidence} confidence." if health.confidence else ""
    if health.capped_by_appetite:
        health_note = (
            f"Capped by {n_exc} appetite {_plural(n_exc, 'breach', 'breaches')}. " + health_note
        ).strip()

    if exceeding:
        r = exceeding[0][1]
        bits = [f"{r.id} {_short(r.description) or ''}".strip() + "."]
        tail = ", ".join(
            x for x in [
                f"Owner {r.owner}" if r.owner else None,
                f"due {_day(r.target_date)}" if r.target_date else None,
            ] if x
        )
        if tail:
            bits.append(tail[0].upper() + tail[1:] + ".")
        appetite_note = " ".join(bits)
    elif not thresholds:
        appetite_note = "No appetite thresholds set yet."
    else:
        appetite_note = "Every scored risk is within or near appetite."

    if unlinked_open and has_risk:
        inc_note = (
            f"{unlinked_open} {_plural(unlinked_open, 'has', 'have')} no matching risk on the register."
        )
    elif pressure.open_incidents == 0:
        inc_note = "Nothing open right now."
    else:
        inc_note = f"{pressure.open_incidents_overdue} past target." if pressure.open_incidents_overdue else "None past target."

    if pressure.undecided:
        n = pressure.undecided
        act_note = f"{n} {_plural(n, 'risk is', 'risks are')} waiting for a treatment decision."
    elif not actions:
        act_note = "Nothing to do right now."
    else:
        act_note = ""

    tiles = HomeTiles(
        health=HomeTile(
            value=None if health.status == "No data" else health.score,
            status=health.status,
            note=health_note,
        ),
        outside_appetite=HomeTile(value=n_exc, note=appetite_note),
        open_incidents=HomeTile(value=pressure.open_incidents, note=inc_note),
        open_high=pressure.open_high,
        open_actions=HomeTile(value=len(actions), note=act_note),
    )

    setup = HomeSetup(
        appetite=data.kpis.appetite_configured,
        risks=data.kpis.total_risks > 0,
        incidents=data.total_incidents.count > 0,
        team=members > 1,
    )
    setup.first_run = not setup.risks and not setup.incidents

    return HomeResponse(
        first_name=first_name,
        workspace=workspace,
        status=status,
        confidence=health.confidence if has_risk else "",
        verdict=verdict,
        focus=focus,
        tiles=tiles,
        actions=actions[:_LIST_LIMIT],
        actions_total=len(actions),
        top_risks=[row for _, row in risk_rows[:_LIST_LIMIT]],
        open_incidents=[row for _, _, row in inc_rows[:_LIST_LIMIT]],
        activity_feed=data.activity_feed[:_FEED_LIMIT] if has_risk else [],
        incident_feed=data.incident_feed[:_FEED_LIMIT] if has_incident else [],
        brief=data.unified_brief,
        setup=setup,
    )
