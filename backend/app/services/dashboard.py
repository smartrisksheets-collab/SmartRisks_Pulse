"""
Dashboard service — translates DashboardService.gs for v2.
All KPI aggregation is done in SQL, not Python loops.
Queries run concurrently via asyncio.gather, each in its own session.
"""

import asyncio
import re
from collections import defaultdict
from datetime import date, datetime, timezone, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select, func, case, text, cast, DateTime, literal_column, nullslast
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal

from app.models.risk import Risk
from app.models.incident import Incident
from app.models.activity_feed import ActivityFeed
from app.models.appetite_threshold import AppetiteThreshold
from app.models.snapshot import SnapshotMonthly
from app.models.tenant import Tenant
from app.models.account import Account
from app.models.dashboard_brief import DashboardBrief
from app.services.brief_facts import brief_facts, facts_hash
from app.schemas.dashboard import (
    DashboardResponse,
    KPISummary,
    IncidentHealthSummary,
    IncidentLifecycle,
    IncidentResolution,
    TotalIncidentsSummary,
    TrendPoint,
    VelocityPoint,
    ActivityEntry,
    TopRisk,
    TopIncident,
    IncidentCategoryBreakdown,
    IncidentFeedEntry,
    SnapshotDelta,
    ScoreComponent,
    AppetiteComparison,
    EnterpriseHealth,
    PressureCategoryRow,
    RiskPressure,
    MaterialisedRisk,
    UnlinkedIncident,
    Correlation,
    ControlEvidenceRow,
    ControlEvidence,
    MovementPoint,
    Movement,
    RecommendedAction,
    UnifiedBriefResponse,
)
from app.services.snapshot import get_snapshot_delta
from app.services.incident import get_stats as incident_get_stats
from app.services.incident_severity import get_severity_ranks, high_severity_labels
from app.services.lookup import get_lookups, covering_risk_categories
from app.services.matrix_config import get_config as get_matrix_config
from app.services.risk_status import (
    appetite_status,
    is_stale,
    is_undecided,
    is_past_target,
    has_recent_test,
    is_independent,
    is_evidenced,
    is_contradicted,
)
import logging

logger = logging.getLogger(__name__)

_MONTH = literal_column("'month'")
_DAYS_DEFAULT = 90
_ACTIVITY_LIMIT = 20
_INCIDENT_FEED_LIMIT = 20
_TOP_RISKS_LIMIT = 6
_TREND_MONTHS = 6


async def _run(fn, *args):
    """Run a query function in its own isolated session for parallel execution.

    Returns None if the query raises. The thirteen dashboard queries are
    independent, so one failure should degrade a single card rather than
    returning a 500 for the whole page. The exception is logged with the
    function name so a silently missing section is still traceable.
    """
    try:
        async with AsyncSessionLocal() as session:
            return await fn(session, *args)
    except Exception:
        logger.exception("dashboard query failed: %s", getattr(fn, "__name__", fn))
        return None


async def get_dashboard(
    db: AsyncSession,
    tenant_id: UUID,
    days: int = _DAYS_DEFAULT,
) -> DashboardResponse:
    # All 13 queries are independent. Run them concurrently, each on its own
    # connection from the pool. Sequential baseline: ~15-30ms * 13 = 195-390ms.
    # Parallel with pool_size=10: ~2 rounds = 30-60ms total.
    (
        kpis,
        risks_by_level,
        risks_by_category,
        top_risks,
        top_open_incidents,
        residual_trend,
        incident_velocity,
        incident_health,
        total_incidents,
        lifecycle,
        avg_resolution,
        activity_feed,
        snapshot_delta,
        incidents_by_category,
        incident_feed,
        intel,
        stored_brief,
    ) = await asyncio.gather(
        _run(_get_kpis,                  tenant_id),
        _run(_risks_by_level,            tenant_id),
        _run(_risks_by_category,         tenant_id),
        _run(_top_risks,                 tenant_id),
        _run(_top_open_incidents,        tenant_id),
        _run(_residual_trend,            tenant_id),
        _run(_incident_velocity,         tenant_id, days),
        _run(_incident_health,           tenant_id),
        _run(_total_incidents,           tenant_id),
        _run(_lifecycle,                 tenant_id),
        _run(_avg_resolution,            tenant_id),
        _run(_activity_feed,             tenant_id),
        _run(get_snapshot_delta,         tenant_id),
        _run(_incidents_by_category,     tenant_id),
        _run(_incident_feed,             tenant_id),
        _run(_intel,                     tenant_id),
        _run(_stored_brief,              tenant_id),
    )

    # _build_attention is synchronous and needs kpis + incident_health,
    # so it runs after the gather resolves.
    # _run returns None when a query fails, so every field falls back to its
    # empty form. Each sub-schema declares defaults on all fields, so the
    # no-arg constructors below are valid and the response contract is
    # unchanged: the frontend still receives a fully shaped object and a
    # failed query renders as one empty card rather than a 500.
    kpis            = kpis            or KPISummary()
    incident_health = incident_health or IncidentHealthSummary()
    total_incidents = total_incidents or TotalIncidentsSummary()
    lifecycle       = lifecycle       or IncidentLifecycle()
    avg_resolution  = avg_resolution  or IncidentResolution()
    snapshot_delta  = snapshot_delta  or SnapshotDelta()

    attention = _build_attention(kpis, incident_health)

    enterprise_health, pressure, correlation, control_evidence, movement = intel or (
        EnterpriseHealth(), RiskPressure(), Correlation(), ControlEvidence(), Movement(),
    )

    response = DashboardResponse(
        kpis=kpis,
        risks_by_level=risks_by_level or {},
        risks_by_category=risks_by_category or {},
        top_risks=top_risks or [],
        top_open_incidents=top_open_incidents or [],
        residual_trend=residual_trend or [],
        incident_velocity=incident_velocity or [],
        incident_health=incident_health,
        total_incidents=total_incidents,
        lifecycle=lifecycle,
        avg_resolution=avg_resolution,
        activity_feed=activity_feed or [],
        incident_feed=incident_feed or [],
        incidents_by_category=incidents_by_category or [],
        attention=attention,
        snapshot_delta=snapshot_delta,
        enterprise_health=enterprise_health,
        pressure=pressure,
        correlation=correlation,
        control_evidence=control_evidence,
        movement=movement,
    )

    if stored_brief is not None:
        brief, stored_hash = stored_brief
        brief.stale = stored_hash != facts_hash(brief_facts(response))
        response.unified_brief = brief

    return response


# ---------------------------------------------------------------------------
# KPI aggregates
# ---------------------------------------------------------------------------

async def _get_kpis(db: AsyncSession, tenant_id: UUID) -> KPISummary:
    risk_row = (await db.execute(
        select(
            func.count(Risk.id).label("total"),
            func.sum(
                case((Risk.is_elevated, 1), else_=0)  # type: ignore[arg-type]
            ).label("high"),
            func.avg(Risk.residual).label("avg_residual"),
            func.avg(
                case(
                    (Risk.control_effectiveness.isnot(None), Risk.control_effectiveness),
                    else_=None,
                )
            ).label("avg_ctrl"),
        ).where(
            Risk.tenant_id == tenant_id,
            Risk.deleted_at.is_(None),
        )
    )).one()

    open_inc = (await db.execute(
        select(func.count(Incident.id)).where(
            Incident.tenant_id == tenant_id,
            Incident.deleted_at.is_(None),
            Incident.status.notin_(["Resolved", "Closed"]),
        )
    )).scalar_one()

    import re as _re
    _fin_rows = (await db.execute(
        select(Risk.financial_exposure).where(
            Risk.tenant_id == tenant_id,
            Risk.deleted_at.is_(None),
            Risk.financial_exposure.isnot(None),
        )
    )).scalars().all()
    _fin_total = 0.0
    for _val in _fin_rows:
        if _val:
            try:
                _fin_total += float(_re.sub(r'[^\d.]', '', str(_val)))
            except ValueError:
                pass

    apt_configured = (await db.execute(
        select(func.count(AppetiteThreshold.id)).where(
            AppetiteThreshold.tenant_id == tenant_id,
        )
    )).scalar_one()

    apt_row = (await db.execute(
        select(
            func.count(Risk.id).filter(
                AppetiteThreshold.threshold.isnot(None),
                Risk.residual.isnot(None),
                Risk.residual <= AppetiteThreshold.threshold * 0.75,
            ).label("within"),
            func.count(Risk.id).filter(
                AppetiteThreshold.threshold.isnot(None),
                Risk.residual.isnot(None),
                Risk.residual > AppetiteThreshold.threshold * 0.75,
                Risk.residual <= AppetiteThreshold.threshold,
            ).label("near_apt"),
            func.count(Risk.id).filter(
                AppetiteThreshold.threshold.isnot(None),
                Risk.residual.isnot(None),
                Risk.residual > AppetiteThreshold.threshold,
            ).label("exceeds"),
        )
        .select_from(Risk)
        .outerjoin(
            AppetiteThreshold,
            (AppetiteThreshold.tenant_id == tenant_id)
            & (AppetiteThreshold.category == Risk.category),
        )
        .where(
            Risk.tenant_id == tenant_id,
            Risk.deleted_at.is_(None),
        )
    )).one()

    return KPISummary(
        total_risks=int(risk_row.total or 0),
        high_risks=int(risk_row.high or 0),
        open_incidents=int(open_inc or 0),
        risk_severity_avg=round(float(risk_row.avg_residual or 0), 1),
        control_effectiveness_avg=round(float(risk_row.avg_ctrl or 0) * 20, 1),
        est_financial_exposure=round(_fin_total, 2),
        appetite_configured=int(apt_configured or 0) > 0,
        risks_within_appetite=int(apt_row.within or 0),
        risks_near_appetite=int(apt_row.near_apt or 0),
        risks_exceeds_appetite=int(apt_row.exceeds or 0),
    )


# ---------------------------------------------------------------------------
# Risk distribution
# ---------------------------------------------------------------------------

async def _risks_by_level(db: AsyncSession, tenant_id: UUID) -> dict[str, int]:
    rows = (await db.execute(
        select(Risk.level, func.count(Risk.id).label("cnt"))
        .where(Risk.tenant_id == tenant_id, Risk.deleted_at.is_(None))
        .group_by(Risk.level)
    )).all()
    return {str(r.level or "Unknown"): int(r.cnt) for r in rows}


async def _risks_by_category(db: AsyncSession, tenant_id: UUID) -> dict[str, int]:
    rows = (await db.execute(
        select(Risk.category, func.count(Risk.id).label("cnt"))
        .where(Risk.tenant_id == tenant_id, Risk.deleted_at.is_(None))
        .group_by(Risk.category)
    )).all()
    return {str(r.category or "Unknown"): int(r.cnt) for r in rows}


async def _top_open_incidents(
    db: AsyncSession, tenant_id: UUID, limit: int = 5
) -> list[TopIncident]:
    ranks = await get_severity_ranks(db, tenant_id)
    severity_order = case(
        *[(Incident.severity == label, rank) for label, rank in ranks.items()],
        else_=len(ranks),
    )
    rows = (await db.execute(
        select(
            Incident.id,
            Incident.title,
            Incident.severity,
            Incident.category,
            Incident.reported_at,
            Incident.status,
        )
        .where(
            Incident.tenant_id == tenant_id,
            Incident.deleted_at.is_(None),
            Incident.status.notin_(["Resolved", "Closed"]),
        )
        .order_by(
            severity_order,
            Incident.reported_at.asc().nulls_last(),
        )
        .limit(limit)
    )).all()
    return [
        TopIncident(
            id=r.id,
            title=r.title,
            severity=r.severity,
            category=r.category,
            reported_at=str(r.reported_at) if r.reported_at else None,
            status=r.status,
        )
        for r in rows
    ]


async def _top_risks(db: AsyncSession, tenant_id: UUID) -> list[TopRisk]:
    rows = (await db.execute(
        select(Risk.id, Risk.description, Risk.residual, Risk.level, Risk.category)
        .where(Risk.tenant_id == tenant_id, Risk.deleted_at.is_(None))
        .order_by(Risk.residual.desc().nulls_last())
        .limit(_TOP_RISKS_LIMIT)
    )).all()
    return [
        TopRisk(
            id=r.id,
            description=r.description,
            residual=float(r.residual) if r.residual is not None else None,
            level=r.level,
            category=r.category,
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Residual trend (last N months grouped by logged_at)
# ---------------------------------------------------------------------------

async def _residual_trend(db: AsyncSession, tenant_id: UUID) -> list[TrendPoint]:
    rows = (await db.execute(
        select(
            func.date_trunc(_MONTH, Risk.logged_at).label("month_bucket"),
            func.avg(Risk.residual).label("avg"),
        )
        .where(
            Risk.tenant_id == tenant_id,
            Risk.deleted_at.is_(None),
            Risk.logged_at.isnot(None),
            Risk.residual.isnot(None),
        )
        .group_by(func.date_trunc(_MONTH, Risk.logged_at))
        .order_by(func.date_trunc(_MONTH, Risk.logged_at))
    )).all()

    points = [
        TrendPoint(
            label=r.month_bucket.strftime("%b %y"),
            avg=round(float(r.avg), 1),
        )
        for r in rows
    ]
    return points[-_TREND_MONTHS:]


# ---------------------------------------------------------------------------
# Incident velocity (created vs resolved per month, last N days)
# ---------------------------------------------------------------------------

async def _incident_velocity(
    db: AsyncSession,
    tenant_id: UUID,
    days: int,
) -> list[VelocityPoint]:
    created_rows = (await db.execute(
        select(
            func.date_trunc(_MONTH, Incident.reported_at).label("month_bucket"),
            func.count(Incident.id).label("cnt"),
        )
        .where(
            Incident.tenant_id == tenant_id,
            Incident.deleted_at.is_(None),
            Incident.reported_at.isnot(None),
        )
        .group_by(func.date_trunc(_MONTH, Incident.reported_at))
        .order_by(func.date_trunc(_MONTH, Incident.reported_at))
    )).all()

    resolved_rows = (await db.execute(
        select(
            func.date_trunc(_MONTH, Incident.resolved_at).label("month_bucket"),
            func.count(Incident.id).label("cnt"),
        )
        .where(
            Incident.tenant_id == tenant_id,
            Incident.deleted_at.is_(None),
            Incident.resolved_at.isnot(None),
        )
        .group_by(func.date_trunc(_MONTH, Incident.resolved_at))
    )).all()

    resolved_map = {r.month_bucket: int(r.cnt) for r in resolved_rows}

    return [
        VelocityPoint(
            key=r.month_bucket.strftime("%Y-%m"),
            label=r.month_bucket.strftime("%b"),
            created=int(r.cnt),
            resolved=resolved_map.get(r.month_bucket, 0),
        )
        for r in created_rows
    ][-_TREND_MONTHS:]


# ---------------------------------------------------------------------------
# Incident health
# ---------------------------------------------------------------------------

async def _incident_health(db: AsyncSession, tenant_id: UUID) -> IncidentHealthSummary:
    high_labels = high_severity_labels(await get_severity_ranks(db, tenant_id))
    row = (await db.execute(
        select(
            func.count(Incident.id).label("total"),
            func.sum(
                case(
                    (
                        Incident.status.notin_(["Resolved", "Closed"])
                        & Incident.severity.in_(high_labels),
                        1,
                    ),
                    else_=0,
                )
            ).label("critical_open"),
        ).where(
            Incident.tenant_id == tenant_id,
            Incident.deleted_at.is_(None),
        )
    )).one()

    total = int(row.total or 0)
    critical_open = int(row.critical_open or 0)
    sla_pct = round((critical_open / total) * 100, 1) if total > 0 else 0.0
    health_score = max(0, min(100, round(100 - sla_pct)))

    label = (
        "Healthy" if health_score >= 76
        else "Monitoring" if health_score >= 51
        else "At Risk" if health_score >= 26
        else "Critical"
    )
    critical_trend = (
        "Improving" if sla_pct <= 10
        else "Stable" if sla_pct <= 25
        else "Worsening"
    )

    return IncidentHealthSummary(
        label=label,
        sla_pct=sla_pct,
        critical_trend=critical_trend,
        health_score=health_score,
    )


async def _total_incidents(db: AsyncSession, tenant_id: UUID) -> TotalIncidentsSummary:
    high_labels = high_severity_labels(await get_severity_ranks(db, tenant_id))
    row = (await db.execute(
        select(
            func.count(Incident.id).label("total"),
            func.sum(
                case(
                    (Incident.status.notin_(["Resolved", "Closed"]), 1),
                    else_=0,
                )
            ).label("open_count"),
            func.sum(
                case(
                    (
                        Incident.status.notin_(["Resolved", "Closed"])
                        & Incident.severity.in_(high_labels),
                        1,
                    ),
                    else_=0,
                )
            ).label("critical"),
            func.sum(Incident.financial_impact).label("financial_total"),
        ).where(
            Incident.tenant_id == tenant_id,
            Incident.deleted_at.is_(None),
        )
    )).one()

    return TotalIncidentsSummary(
        count=int(row.total or 0),
        open_count=int(row.open_count or 0),
        critical_exposure=int(row.critical or 0),
        financial_total=float(row.financial_total or 0),
    )


async def _incidents_by_category(
    db: AsyncSession,
    tenant_id: UUID,
) -> list[IncidentCategoryBreakdown]:
    category_expr = func.coalesce(
        Incident.category,
        literal_column("'Other'")
    ).label("category")

    financial_total = func.sum(Incident.financial_impact).label("financial_total")

    rows = (
        await db.execute(
            select(
                category_expr,
                func.count(Incident.id).label("cnt"),
                financial_total,
            )
            .where(
                Incident.tenant_id == tenant_id,
                Incident.deleted_at.is_(None),
            )
            .group_by(category_expr)
            .order_by(financial_total.desc().nulls_last())
        )
    ).all()

    return [
        IncidentCategoryBreakdown(
            category=str(r.category),
            count=int(r.cnt),
            financial_total=float(r.financial_total or 0),
        )
        for r in rows
    ]


async def _lifecycle(db: AsyncSession, tenant_id: UUID) -> IncidentLifecycle:
    rows = (await db.execute(
        select(Incident.status, func.count(Incident.id).label("cnt"))
        .where(
            Incident.tenant_id == tenant_id,
            Incident.deleted_at.is_(None),
        )
        .group_by(Incident.status)
    )).all()

    counts: dict[str, int] = {}
    for r in rows:
        s = str(r.status or "Open").lower()
        if s == "new" or s == "open":
            counts["new"] = counts.get("new", 0) + int(r.cnt)
        elif s in ("under review", "in progress", "investigating"):
            counts["review"] = counts.get("review", 0) + int(r.cnt)
        elif s in ("resolved", "closed"):
            counts["resolved"] = counts.get("resolved", 0) + int(r.cnt)

    return IncidentLifecycle(
        new_count=counts.get("new", 0),
        under_review=counts.get("review", 0),
        resolved=counts.get("resolved", 0),
    )


async def _avg_resolution(db: AsyncSession, tenant_id: UUID) -> IncidentResolution:
    row = (await db.execute(
        select(
            func.avg(
                func.extract(
                    "epoch",
                    Incident.resolved_at - cast(Incident.reported_at, DateTime(timezone=True)),
                )
                / 86400
            ).label("avg_mttr"),
            func.count(Incident.id).label("data_points"),
        ).where(
            Incident.tenant_id == tenant_id,
            Incident.deleted_at.is_(None),
            Incident.resolved_at.isnot(None),
            Incident.reported_at.isnot(None),
        )
    )).one()

    return IncidentResolution(
        days=round(float(row.avg_mttr), 1) if row.avg_mttr else None,
        data_points=int(row.data_points or 0),
    )


# ---------------------------------------------------------------------------
# Activity feed
# ---------------------------------------------------------------------------

async def _activity_feed(
    db: AsyncSession,
    tenant_id: UUID,
) -> list[ActivityEntry]:
    rows = (await db.execute(
        select(ActivityFeed)
        .where(ActivityFeed.tenant_id == tenant_id)
        .order_by(ActivityFeed.created_at.desc())
        .limit(_ACTIVITY_LIMIT)
    )).scalars().all()

    return [
        ActivityEntry(
            id=str(r.id or ""),
            risk_id=str(r.risk_id or ""),
            risk_title=str(r.risk_title or ""),
            action_type=str(r.action_type or ""),
            old_value=float(r.old_value) if r.old_value is not None else None,  # type: ignore[arg-type]
            new_value=float(r.new_value) if r.new_value is not None else None,  # type: ignore[arg-type]
            user_email=str(r.user_email or ""),
            category=str(r.category or ""),
            level=str(r.level or ""),
            label=str(r.label or ""),
            created_at=r.created_at.isoformat() if r.created_at else "",  # type: ignore[union-attr]
        )
        for r in rows
    ]


async def _incident_feed(
    db: AsyncSession,
    tenant_id: UUID,
) -> list[IncidentFeedEntry]:
    rows = (await db.execute(
        select(Incident)
        .where(
            Incident.tenant_id == tenant_id,
            Incident.deleted_at.is_(None),
        )
        .order_by(Incident.updated_at.desc())
        .limit(_INCIDENT_FEED_LIMIT)
    )).scalars().all()

    entries: list[IncidentFeedEntry] = []
    for r in rows:
        reported_at = r.reported_at
        resolved_at = r.resolved_at
        updated_at  = r.updated_at
        status      = str(r.status or "Open")
        severity    = str(r.severity or "")

        # Derive event_type from the incident's state
        if resolved_at is not None:
            event_type = "incident_resolved"
        elif status.lower() in ("in progress", "under review"):
            event_type = "incident_in_progress"
        elif severity.lower() in ("critical", "very high", "high"):
            event_type = "incident_escalated"
        else:
            event_type = "incident_created"

        # Use resolved_at for resolved events, updated_at otherwise
        ts = resolved_at or updated_at or reported_at
        created_at_str = ts.isoformat() if ts is not None else ""  # type: ignore[union-attr]

        entries.append(IncidentFeedEntry(
            id=str(r.id or ""),
            incident_id=str(r.id or ""),
            incident_title=str(r.title or "") or None,
            event_type=event_type,
            severity=severity or None,
            category=str(r.category or "") or None,
            status=status,
            old_status=None,
            linked_risk_id=str(r.linked_risk_id or "").strip() or None,
            created_at=created_at_str,
        ))

    return entries


# ---------------------------------------------------------------------------
# Unified intelligence: health, pressure, correlation, evidence, movement
# ---------------------------------------------------------------------------

_HEALTH_BANDS: tuple[tuple[int, str], ...] = ((76, "Healthy"), (51, "Monitoring"), (26, "At Risk"))
_PRESSURE_BANDS: tuple[tuple[int, str], ...] = ((60, "Elevated"), (30, "Moderate"))
_CONTROL_EVIDENCE_FLOOR = 0.35   # share of control strength credited with zero evidence
_LIST_LIMIT = 25                 # rows per modal list; counts are always complete


def _clamp(v: float) -> int:
    return int(max(0, min(100, round(v))))


def _band(score: int, bands: tuple[tuple[int, str], ...], floor_label: str) -> str:
    for threshold, label in bands:
        if score >= threshold:
            return label
    return floor_label


def _weighted_score(components: list[ScoreComponent]) -> int | None:
    """Weighted mean of active components. None when every component is suppressed."""
    active = [c for c in components if not c.suppressed and c.weight > 0]
    total_w = sum(c.weight for c in active)
    if total_w == 0:
        return None
    return _clamp(sum(c.score * c.weight for c in active) / total_w)


def _money(val: object) -> float | None:
    if val is None:
        return None
    digits = re.sub(r"[^\d.]", "", str(val))
    if not digits:
        return None
    try:
        return float(digits)
    except ValueError:
        return None


def _iso(d: object) -> str | None:
    return d.isoformat() if isinstance(d, date) else None


def _plural(n: int, one: str, many: str) -> str:
    return one if n == 1 else many


def _ids_text(ids: list[str], limit: int = 4) -> str:
    """'R-001', 'R-001 and R-004', or 'R-001, R-002, R-003, R-004 and 3 more'."""
    if not ids:
        return ""
    shown = ids[:limit]
    rest = len(ids) - len(shown)
    if rest > 0:
        return f"{', '.join(shown)} and {rest} more"
    if len(shown) == 1:
        return shown[0]
    return f"{', '.join(shown[:-1])} and {shown[-1]}"


def _owners_text(owners: list[Any], group_label: str) -> str | None:
    """Named owners when there are one or two, a group label beyond that, None when nobody is recorded."""
    distinct = sorted({str(o).strip() for o in owners if o is not None and str(o).strip()})
    if not distinct:
        return None
    if len(distinct) <= 2:
        return " and ".join(distinct)
    return group_label


def _next_due(dates: list[Any], today: date) -> str | None:
    """Earliest target date that has not passed yet."""
    upcoming = [d for d in dates if isinstance(d, date) and d >= today]
    return min(upcoming).isoformat() if upcoming else None


def _trend_findings(points: list[MovementPoint]) -> list[str]:
    """Plain-language trend statement. Needs three residual points or says nothing."""
    series = [p for p in points if p.avg_residual is not None]
    if len(series) < 3:
        return []
    first = series[0].avg_residual or 0.0
    last = series[-1].avg_residual or 0.0
    months = len(series)
    half = len(points) // 2
    early = sum(p.incidents_created for p in points[:half])
    late = sum(p.incidents_created for p in points[half:])
    res_change = ((last - first) / first * 100) if first > 0 else None
    if res_change is None:
        return []
    res_flat = abs(res_change) < 10
    incidents_surged = late > early and (early == 0 or (late - early) / early >= 0.5)

    if (res_flat or res_change < 0) and incidents_surged:
        residual_txt = "has stayed flat" if res_flat else f"has fallen {abs(round(res_change))}%"
        rise_txt = "from none" if early == 0 else f"by {round((late - early) / early * 100)}%"
        return [
            f"Average residual {residual_txt} over {months} months while incident volume rose {rise_txt}. "
            "Residual scores may not reflect what is actually happening."
        ]
    return [
        f"Average residual moved {res_change:+.0f}% over {months} months; incidents went from "
        f"{early} in the first half of the period to {late} in the second."
    ]


async def _intel(
    db: AsyncSession,
    tenant_id: UUID,
) -> tuple[EnterpriseHealth, RiskPressure, Correlation, ControlEvidence, Movement]:
    today = date.today()

    risks = (await db.execute(
        select(
            Risk.id, Risk.description, Risk.category, Risk.owner, Risk.residual,
            Risk.control_effectiveness, Risk.is_elevated, Risk.linked_decision,
            Risk.mitigation_status, Risk.target_date, Risk.last_reviewed_at,
            Risk.logged_at, Risk.control_last_tested, Risk.control_assertion_source,
            Risk.financial_exposure,
        ).where(Risk.tenant_id == tenant_id, Risk.deleted_at.is_(None))
    )).all()

    incidents = (await db.execute(
        select(
            Incident.id, Incident.title, Incident.category, Incident.severity,
            Incident.reported_at, Incident.linked_risk_id, Incident.financial_impact,
            Incident.assigned_to,
        ).where(Incident.tenant_id == tenant_id, Incident.deleted_at.is_(None))
    )).all()

    thresholds: dict[str, float] = {
        str(t.category): float(t.threshold)
        for t in (await db.execute(
            select(AppetiteThreshold.category, AppetiteThreshold.threshold)
            .where(AppetiteThreshold.tenant_id == tenant_id)
        )).all()
        if t.category is not None and t.threshold is not None
    }

    snapshots_held = int((await db.execute(
        select(func.count(SnapshotMonthly.id)).where(SnapshotMonthly.tenant_id == tenant_id)
    )).scalar_one() or 0)

    snap_rows = (await db.execute(
        select(SnapshotMonthly.month_key, SnapshotMonthly.month_label, SnapshotMonthly.avg_residual)
        .where(SnapshotMonthly.tenant_id == tenant_id)
        .order_by(SnapshotMonthly.month_key.desc())
        .limit(_TREND_MONTHS)
    )).all()

    inc_stats = await incident_get_stats(db, tenant_id)
    lookups = await get_lookups(db, tenant_id)
    matrix = await get_matrix_config(db, tenant_id)
    sev_rank = await get_severity_ranks(db, tenant_id)
    owner_row = (await db.execute(
        select(Account.name, Account.email)
        .join(Tenant, Tenant.created_by == Account.id)
        .where(Tenant.id == tenant_id)
    )).first()
    workspace_owner = (
        (str(owner_row.name or "").strip() or str(owner_row.email or "")) or None
        if owner_row is not None else None
    )
    scale_max = max(1, int(matrix.likelihood_scale) * int(matrix.impact_scale))
    cat_map = lookups.incident_category_map
    risk_cats = lookups.category

    # ── Per-risk pass ─────────────────────────────────────────────────────────
    total = len(risks)
    risk_by_id = {str(r.id): r for r in risks}
    residuals = [float(r.residual) for r in risks if r.residual is not None]
    avg_res = round(sum(residuals) / len(residuals), 1) if residuals else 0.0

    within = near = exceeds = elevated = stale = undecided = past_target = backlog = 0
    scored_res: list[float] = []
    scored_thr: list[float] = []
    fin_total = 0.0
    fin_quantified = 0
    cat_rows: dict[str, PressureCategoryRow] = {}
    exceed_rows: list[Any] = []
    undecided_rows: list[Any] = []
    past_rows: list[Any] = []

    for r in risks:
        cat = str(r.category or "Uncategorised")
        residual = float(r.residual) if r.residual is not None else None
        threshold = thresholds.get(cat)
        ap = appetite_status(residual, threshold)
        is_elev = bool(r.is_elevated)

        row = cat_rows.setdefault(cat, PressureCategoryRow(category=cat, threshold_configured=threshold is not None))
        row.risks += 1
        if is_elev:
            elevated += 1
            row.elevated += 1
        if ap == "within":
            within += 1
            row.within += 1
        elif ap == "near":
            near += 1
            row.near += 1
        elif ap == "exceeds":
            exceeds += 1
            row.exceeds += 1
            exceed_rows.append(r)
        if ap is not None and residual is not None and threshold is not None:
            scored_res.append(residual)
            scored_thr.append(threshold)

        if is_stale(r.last_reviewed_at, r.logged_at):
            stale += 1
        u = is_undecided(
            is_elevated=is_elev, appetite=ap,
            linked_decision=r.linked_decision, mitigation_status=r.mitigation_status,
        )
        p = is_past_target(target_date=r.target_date, mitigation_status=r.mitigation_status, today=today)
        undecided += int(u)
        past_target += int(p)
        if u:
            undecided_rows.append(r)
        if p:
            past_rows.append(r)
        backlog += int(u or p)

        money = _money(r.financial_exposure)
        if money is not None:
            fin_total += money
            fin_quantified += 1

    # ── Incident linkage ─────────────────────────────────────────────────────
    linked_by_risk: dict[str, list[Any]] = defaultdict(list)
    unlinked_rows: list[Any] = []
    for inc in incidents:
        link = str(inc.linked_risk_id or "").strip()
        if not link:
            unlinked_rows.append(inc)
        elif link in risk_by_id:
            linked_by_risk[link].append(inc)

    def _covering(inc_cat: str) -> list[str]:
        """Mapped risk categories that actually hold at least one risk."""
        return [c for c in covering_risk_categories(inc_cat, cat_map, risk_cats) if c in cat_rows]

    inc_cat_counts: dict[str, int] = defaultdict(int)
    for inc in incidents:
        inc_cat_counts[str(inc.category or "Other")] += 1
    uncovered: list[tuple[str, int]] = []
    for inc_cat, n in inc_cat_counts.items():
        cov = _covering(inc_cat)
        if cov:
            for c in cov:
                cat_rows[c].incidents += n
        else:
            uncovered.append((inc_cat, n))
    uncovered.sort(key=lambda x: -x[1])

    # ── Control evidence ─────────────────────────────────────────────────────
    rated_rows = [r for r in risks if r.control_effectiveness is not None]
    rated_n = len(rated_rows)
    with_test = independent_n = evidenced = rated_high = contradicted = 0
    ev_rows: list[ControlEvidenceRow] = []
    unev_high: list[Any] = []
    for r in rated_rows:
        rid = str(r.id)
        rating = int(r.control_effectiveness)
        tested = has_recent_test(r.control_last_tested, today)
        independent = is_independent(r.control_assertion_source)
        ev = is_evidenced(
            control_last_tested=r.control_last_tested,
            control_assertion_source=r.control_assertion_source,
            today=today,
        )
        contra = is_contradicted(rating, rid in linked_by_risk)
        with_test += int(tested)
        independent_n += int(independent)
        evidenced += int(ev)
        rated_high += int(rating >= 4)
        contradicted += int(contra)
        if rating >= 4 and not ev and not contra:
            unev_high.append(r)
        ev_rows.append(ControlEvidenceRow(
            risk_id=rid,
            category=r.category,
            description=r.description,
            owner=r.owner,
            control_rating=rating,
            last_tested=_iso(r.control_last_tested),
            assertion_source=(str(r.control_assertion_source).strip() or None) if r.control_assertion_source is not None else None,
            status="contradicted" if contra else "evidenced" if ev else "unevidenced",
        ))
    ev_rows.sort(key=lambda x: (x.status != "contradicted", -(x.control_rating or 0)))

    # ── Materialised risks ───────────────────────────────────────────────────
    mat_rows: list[MaterialisedRisk] = []
    for rid, incs in linked_by_risk.items():
        r = risk_by_id[rid]
        rating_m = int(r.control_effectiveness) if r.control_effectiveness is not None else None
        latest = max(incs, key=lambda i: i.reported_at or date.min)
        impacts = [float(i.financial_impact) for i in incs if i.financial_impact is not None]
        mat_rows.append(MaterialisedRisk(
            risk_id=rid,
            category=r.category,
            description=r.description,
            owner=r.owner,
            residual=float(r.residual) if r.residual is not None else None,
            control_rating=rating_m,
            contradicted=is_contradicted(rating_m, True),
            incident_count=len(incs),
            latest_incident_id=str(latest.id),
            latest_incident_severity=latest.severity,
            latest_incident_reported_at=_iso(latest.reported_at),
            financial_total=round(sum(impacts), 2),
            financial_quantified=len(impacts),
        ))
    mat_rows.sort(key=lambda m: (not m.contradicted, -(m.residual or 0.0)))

    # ── Unlinked incidents ───────────────────────────────────────────────────
    unl: list[UnlinkedIncident] = []
    for inc in unlinked_rows:
        cov = _covering(str(inc.category or "Other"))
        unl.append(UnlinkedIncident(
            incident_id=str(inc.id),
            title=inc.title,
            category=inc.category,
            severity=inc.severity,
            reported_at=_iso(inc.reported_at),
            covered=bool(cov),
            covering_categories=cov,
            candidate_risks=sum(cat_rows[c].risks for c in cov),
        ))
    unl.sort(key=lambda x: x.reported_at or "", reverse=True)
    unl.sort(key=lambda x: (x.covered, sev_rank.get(x.severity or "", len(sev_rank))))

    # ── Correlation figures (computed on full lists, before the 25-row cap) ──
    mat_incidents = sum(len(v) for v in linked_by_risk.values())
    mat_fin_total = round(sum(m.financial_total for m in mat_rows), 2)
    mat_fin_quantified = sum(m.financial_quantified for m in mat_rows)

    mat_cat_counts: dict[str, int] = defaultdict(int)
    for m in mat_rows:
        mat_cat_counts[str(m.category or "Uncategorised")] += 1
    repeat_categories = sorted(c for c, n in mat_cat_counts.items() if n >= 2)

    unl_cat_counts: dict[str, int] = defaultdict(int)
    for u_inc in unl:
        unl_cat_counts[str(u_inc.category or "Other")] += 1
    recurring_unlinked = sorted(c for c, n in unl_cat_counts.items() if n >= 2)
    worst_unlinked = min(unl, key=lambda x: sev_rank.get(x.severity or "", len(sev_rank)), default=None)
    inc_owner = {str(i.id): i.assigned_to for i in incidents}

    # ── Recommended actions ──────────────────────────────────────────────────
    pressure_actions: list[RecommendedAction] = []
    if exceed_rows:
        ids = [str(r.id) for r in exceed_rows]
        n = len(ids)
        pressure_actions.append(RecommendedAction(
            key="appetite_breach",
            title=f"Resolve {n} appetite {_plural(n, 'breach', 'breaches')}",
            detail=(
                f"{_ids_text(ids)} {_plural(n, 'is', 'are')} operating above the approved threshold for "
                f"{_plural(n, 'its', 'their')} category. Bring exposure back inside, or have a revised threshold approved."
            ),
            done_when="Every listed risk is back within or near appetite, or a revised threshold is approved and recorded.",
            owner=_owners_text([r.owner for r in exceed_rows], "Risk owners"),
            due=_next_due([r.target_date for r in exceed_rows], today),
            refs=ids,
        ))
    if undecided_rows:
        ids = [str(r.id) for r in undecided_rows]
        n = len(ids)
        pressure_actions.append(RecommendedAction(
            key="undecided",
            title=f"Record decisions on {n} undecided {_plural(n, 'risk', 'risks')}",
            detail=f"{_ids_text(ids)} {_plural(n, 'is', 'are')} elevated or outside appetite with no recorded decision.",
            done_when="Each listed risk has a linked decision, or is marked Accepted.",
            owner=_owners_text([r.owner for r in undecided_rows], "Risk owners"),
            due=_next_due([r.target_date for r in undecided_rows], today),
            refs=ids,
        ))
    if past_rows:
        ids = [str(r.id) for r in past_rows]
        n = len(ids)
        pressure_actions.append(RecommendedAction(
            key="past_target",
            title=f"Deliver {n} overdue {_plural(n, 'treatment', 'treatments')}",
            detail=f"{_ids_text(ids)} passed {_plural(n, 'its', 'their')} target date while treatment is still open.",
            done_when="Each is closed, or given a revised target date with a recorded reason.",
            owner=_owners_text([r.owner for r in past_rows], "Risk owners"),
            refs=ids,
        ))
    for cat, n in uncovered[:2]:
        pressure_actions.append(RecommendedAction(
            key=f"cover_{cat}",
            title=f"Open a {cat} risk line",
            detail=(
                f"{n} {_plural(n, 'incident', 'incidents')} in {cat}, which no register risk covers. "
                "Until one does, this exposure is invisible to every score on the dashboard."
            ),
            done_when=f"A risk covering {cat} is logged, scored and owned, or {cat} is mapped in Settings to a risk category that holds risks.",
            owner=workspace_owner,
            refs=[cat],
        ))

    contra_mat = [m for m in mat_rows if m.contradicted]
    other_mat = [m for m in mat_rows if not m.contradicted]
    retest_action: RecommendedAction | None = None
    if contra_mat:
        ids = [m.risk_id for m in contra_mat]
        n = len(ids)
        retest_action = RecommendedAction(
            key="retest_contradicted",
            title=f"Re-test {n} contradicted control {_plural(n, 'rating', 'ratings')}",
            detail=(
                f"{_ids_text(ids)} {_plural(n, 'is', 'are')} rated 4 or 5 for control effectiveness and still produced "
                "an incident. The rating overstates the control until a test says otherwise."
            ),
            done_when="Each rating is revised, or supported by a test dated after the incident.",
            owner=_owners_text([m.owner for m in contra_mat], "Risk owners"),
            refs=ids,
        )

    materialised_actions: list[RecommendedAction] = []
    if retest_action is not None:
        materialised_actions.append(retest_action)
    if other_mat:
        ids = [m.risk_id for m in other_mat]
        n = len(ids)
        materialised_actions.append(RecommendedAction(
            key="review_materialised",
            title=f"Review treatment on {n} materialised {_plural(n, 'risk', 'risks')}",
            detail=f"{_ids_text(ids)} {_plural(n, 'was', 'were')} identified in advance and the control did not prevent an incident.",
            done_when="The root cause of each linked incident is recorded on the risk, and the treatment is reviewed.",
            owner=_owners_text([m.owner for m in other_mat], "Risk owners"),
            refs=ids,
        ))

    unlinked_actions: list[RecommendedAction] = []
    gap_cats = [(c, unl_cat_counts[c]) for c, _ in uncovered if unl_cat_counts.get(c)]
    for cat, n in gap_cats[:2]:
        unlinked_actions.append(RecommendedAction(
            key=f"cover_{cat}",
            title=f"Cover {cat} on the register",
            detail=f"{n} unlinked {_plural(n, 'incident', 'incidents')} in {cat}, and no register risk covers that category.",
            done_when=f"A risk covering {cat} exists and its incidents are linked, or {cat} is mapped in Settings to a risk category that holds risks.",
            owner=workspace_owner,
            refs=[cat],
        ))
    missed = [u_inc for u_inc in unl if u_inc.covered]
    if missed:
        ids = [u_inc.incident_id for u_inc in missed]
        n = len(ids)
        unlinked_actions.append(RecommendedAction(
            key="link_missed",
            title=f"Link {n} {_plural(n, 'incident', 'incidents')} to existing risks",
            detail=(
                f"{_ids_text(ids)} {_plural(n, 'falls', 'fall')} in categories the register already covers, "
                "so a matching risk probably exists and triage missed it."
            ),
            done_when="Each is linked to a risk, or a reason for no link is recorded.",
            owner=_owners_text([inc_owner.get(i) for i in ids], "Incident owners"),
            refs=ids,
        ))
    if incidents and len(unlinked_rows) * 2 >= len(incidents):
        unlinked_actions.append(RecommendedAction(
            key="triage_linkage",
            title="Make risk linkage part of triage",
            detail=(
                f"{len(unlinked_rows)} of {len(incidents)} incidents carry no register link, so there is no way to "
                "tell whether the register anticipated them."
            ),
            done_when="Triage records a linked risk, or a reason for none, on every incident.",
            owner=workspace_owner,
        ))

    evidence_actions: list[RecommendedAction] = []
    if retest_action is not None:
        evidence_actions.append(retest_action)
    if unev_high:
        ids = [str(r.id) for r in unev_high]
        n = len(ids)
        evidence_actions.append(RecommendedAction(
            key="evidence_high",
            title=f"Evidence the {n} highest control {_plural(n, 'rating', 'ratings')}",
            detail=(
                f"{_ids_text(ids)} {_plural(n, 'carries', 'carry')} a rating of 4 or 5 without a recent independent "
                "test. A high rating removes most of a risk's severity from its residual score, so these are the "
                "largest unverified assumptions on the register."
            ),
            done_when=(
                "Each carries a test dated within 12 months that was independently tested or externally audited, "
                "or the rating is revised."
            ),
            owner=_owners_text([r.owner for r in unev_high], "Risk owners"),
            refs=ids,
        ))
    if rated_n and independent_n * 2 < rated_n:
        evidence_actions.append(RecommendedAction(
            key="independent_testing",
            title="Plan independent testing of control ratings",
            detail=f"{rated_n - independent_n} of {rated_n} control ratings rest on self-assessment alone.",
            done_when="The highest-rated controls are independently tested or externally audited on a recurring cycle.",
            owner=workspace_owner,
        ))

    # ── Enterprise health ────────────────────────────────────────────────────
    scored = within + near + exceeds
    ctrl_strength = (sum(int(r.control_effectiveness) for r in rated_rows) / rated_n) * 20 if rated_n else 0.0
    ev_share = evidenced / rated_n if rated_n else 0.0
    inc_count = inc_stats.totals.count

    health_components = [
        ScoreComponent(name="Exposure", weight=30,
                       score=_clamp(100 - avg_res / scale_max * 100), suppressed=total == 0),
        ScoreComponent(name="Appetite conformance", weight=25,
                       score=_clamp((within + 0.5 * near) / scored * 100) if scored else 0,
                       suppressed=scored == 0),
        ScoreComponent(name="Control assurance", weight=20,
                       score=_clamp(ctrl_strength * (_CONTROL_EVIDENCE_FLOOR + (1 - _CONTROL_EVIDENCE_FLOOR) * ev_share)),
                       suppressed=rated_n == 0),
        ScoreComponent(name="Incident performance", weight=20,
                       score=inc_stats.health.score if inc_count else 0, suppressed=inc_count == 0),
        ScoreComponent(name="Register integrity", weight=5,
                       score=_clamp((total - stale) / total * 100) if total else 0, suppressed=total == 0),
    ]
    health_score = _weighted_score(health_components)
    if health_score is None:
        raw_status = status = "No data"
        capped = False
    else:
        raw_status = _band(health_score, _HEALTH_BANDS, "Critical")
        capped = exceeds > 0 and raw_status in ("Healthy", "Monitoring")
        status = "At Risk" if capped else raw_status

    reasons: list[str] = []
    if snapshots_held < 2:
        reasons.append("fewer than two monthly snapshots held")
    if not thresholds:
        reasons.append("no appetite thresholds configured")
    if rated_n == 0:
        reasons.append("no control ratings recorded")
    elif ev_share < 0.5:
        reasons.append(f"{rated_n - evidenced} of {rated_n} control ratings unevidenced")
    if inc_count < 5:
        reasons.append(f"only {inc_count} incident{'s' if inc_count != 1 else ''} recorded")
    confidence = "High" if not reasons else "Medium" if len(reasons) == 1 else "Low"

    enterprise_health = EnterpriseHealth(
        score=health_score or 0,
        status=status,
        raw_status=raw_status,
        capped_by_appetite=capped,
        confidence=confidence,
        confidence_reasons=reasons,
        components=health_components,
        appetite=AppetiteComparison(
            configured=bool(thresholds),
            scored_risks=scored,
            avg_residual_scored=round(sum(scored_res) / len(scored_res), 1) if scored_res else None,
            threshold_avg=round(sum(scored_thr) / len(scored_thr), 1) if scored_thr else None,
        ),
        avg_residual=avg_res,
        scale_max=scale_max,
        incident_health_score=inc_stats.health.score if inc_count else None,
        incident_count=inc_count,
        financial_exposure=round(fin_total, 2),
        financial_quantified=fin_quantified,
    )

    # ── Risk pressure ────────────────────────────────────────────────────────
    open_n = inc_stats.totals.open_count
    overdue_n = inc_stats.totals.overdue_count
    pressure_components = [
        ScoreComponent(name="Elevated risk share", weight=40,
                       score=_clamp(elevated / total * 100) if total else 0, suppressed=total == 0),
        ScoreComponent(name="Appetite breaches", weight=25,
                       score=_clamp(exceeds / scored * 100) if scored else 0, suppressed=scored == 0),
        ScoreComponent(name="Open incident load", weight=20,
                       score=_clamp(overdue_n / open_n * 100) if open_n else 0, suppressed=inc_count == 0),
        ScoreComponent(name="Decision backlog", weight=15,
                       score=_clamp(backlog / total * 100) if total else 0, suppressed=total == 0),
    ]
    pressure_score = _weighted_score(pressure_components)
    by_category = sorted(cat_rows.values(), key=lambda x: -x.risks) + [
        PressureCategoryRow(category=c, covered=False, incidents=n) for c, n in uncovered
    ]
    pressure = RiskPressure(
        score=pressure_score or 0,
        level="No data" if pressure_score is None else _band(pressure_score, _PRESSURE_BANDS, "Low"),
        components=pressure_components,
        active_risks=total,
        elevated=elevated,
        exceeds_appetite=exceeds,
        open_incidents=open_n,
        open_incidents_overdue=overdue_n,
        undecided=undecided,
        past_target=past_target,
        evidenced=evidenced,
        rated=rated_n,
        by_category=by_category,
        actions=pressure_actions,
    )

    correlation = Correlation(
        risks_total=total,
        risks_materialised=len(mat_rows),
        contradicted=sum(1 for m in mat_rows if m.contradicted),
        incidents_total=len(incidents),
        incidents_unlinked=len(unlinked_rows),
        uncovered_categories=[c for c, _ in uncovered],
        materialised_incidents=mat_incidents,
        materialised_financial_total=mat_fin_total,
        materialised_financial_quantified=mat_fin_quantified,
        repeat_categories=repeat_categories,
        recurring_unlinked_categories=recurring_unlinked,
        highest_unlinked_severity=worst_unlinked.severity if worst_unlinked else None,
        highest_unlinked_id=worst_unlinked.incident_id if worst_unlinked else None,
        materialised=mat_rows[:_LIST_LIMIT],
        unlinked=unl[:_LIST_LIMIT],
        materialised_actions=materialised_actions,
        unlinked_actions=unlinked_actions,
    )

    control_evidence = ControlEvidence(
        rated=rated_n,
        with_recent_test=with_test,
        independently_asserted=independent_n,
        evidenced=evidenced,
        rated_high=rated_high,
        contradicted=contradicted,
        rows=ev_rows[:_LIST_LIMIT],
        actions=evidence_actions,
    )

    # ── Movement ─────────────────────────────────────────────────────────────
    created_by_month: dict[str, int] = defaultdict(int)
    for inc in incidents:
        if inc.reported_at is not None:
            created_by_month[inc.reported_at.isoformat()[:7]] += 1

    points = [
        MovementPoint(
            month_key=str(s.month_key),
            label=str(s.month_label or s.month_key),
            avg_residual=float(s.avg_residual) if s.avg_residual is not None else None,
        )
        for s in reversed(snap_rows)
    ]
    current_key = today.strftime("%Y-%m")
    if not points or points[-1].month_key != current_key:
        points.append(MovementPoint(
            month_key=current_key,
            label=today.strftime("%b %Y"),
            avg_residual=avg_res if residuals else None,
            is_live=True,
        ))
    points = points[-_TREND_MONTHS:]
    for pt in points:
        pt.incidents_created = created_by_month.get(pt.month_key, 0)

    overlap: list[str] = []
    for inc_cat, n in uncovered[:2]:
        overlap.append(
            f"{inc_cat} has produced {n} incident{'s' if n != 1 else ''} and no risk on the register covers it."
        )
    quiet = [row for row in cat_rows.values() if row.incidents == 0]
    if incidents and quiet:
        biggest = max(quiet, key=lambda x: x.risks)
        overlap.append(
            f"{biggest.category} holds {biggest.risks} risk{'s' if biggest.risks != 1 else ''} "
            "and has produced no incidents."
        )

    movement = Movement(
        snapshots_held=snapshots_held,
        points=points,
        trend_findings=_trend_findings(points),
        overlap_findings=overlap,
    )

    return enterprise_health, pressure, correlation, control_evidence, movement


async def _stored_brief(
    db: AsyncSession,
    tenant_id: UUID,
) -> tuple[UnifiedBriefResponse, str] | None:
    """The saved executive brief and the fingerprint of the facts it was written from."""
    row = await db.get(DashboardBrief, tenant_id)
    if row is None:
        return None
    brief = UnifiedBriefResponse(
        paragraphs=[str(p) for p in (row.paragraphs or [])],  # type: ignore[union-attr]
        generated_at=row.generated_at.isoformat() if row.generated_at is not None else "",  # type: ignore[union-attr]
        generated_by=str(row.generated_by) if row.generated_by is not None else None,
    )
    return brief, str(row.facts_hash)


# ---------------------------------------------------------------------------
# Attention list
# ---------------------------------------------------------------------------

def _build_attention(
    kpis: KPISummary,
    inc_health: IncidentHealthSummary,
) -> list[str]:
    items: list[str] = []
    if kpis.high_risks > 0:
        items.append(f"{kpis.high_risks} High or Critical risk(s) require attention.")
    if kpis.open_incidents > 0:
        items.append(f"{kpis.open_incidents} open incident(s) pending resolution.")
    if inc_health.sla_pct > 25:
        items.append("Incident health is Critical — review open high-severity incidents.")
    elif inc_health.sla_pct > 10:
        items.append("Incident health is At Risk — monitor resolution velocity.")
    if not items:
        items.append("No urgent items flagged. Risk posture is within tolerance.")
    return items