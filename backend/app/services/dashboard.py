"""
Dashboard service — translates DashboardService.gs for v2.
All KPI aggregation is done in SQL, not Python loops.
Queries run concurrently via asyncio.gather, each in its own session.
"""

import asyncio
from datetime import datetime, timezone, timedelta
from uuid import UUID

from sqlalchemy import select, func, case, text, cast, DateTime, literal_column
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal

from app.models.risk import Risk
from app.models.incident import Incident
from app.models.activity_feed import ActivityFeed
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
    SnapshotDelta,
)
from app.services.snapshot import get_snapshot_delta

_MONTH = literal_column("'month'")
_DAYS_DEFAULT = 90
_SLA_TARGET_DAYS = 5
_ACTIVITY_LIMIT = 20
_TOP_RISKS_LIMIT = 6
_TREND_MONTHS = 6


async def _run(fn, *args):
    """Run a query function in its own isolated session for parallel execution."""
    async with AsyncSessionLocal() as session:
        return await fn(session, *args)


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
    ) = await asyncio.gather(
        _run(_get_kpis,           tenant_id),
        _run(_risks_by_level,     tenant_id),
        _run(_risks_by_category,  tenant_id),
        _run(_top_risks,          tenant_id),
        _run(_top_open_incidents, tenant_id),
        _run(_residual_trend,     tenant_id),
        _run(_incident_velocity,  tenant_id, days),
        _run(_incident_health,    tenant_id),
        _run(_total_incidents,    tenant_id),
        _run(_lifecycle,          tenant_id),
        _run(_avg_resolution,     tenant_id),
        _run(_activity_feed,      tenant_id),
        _run(get_snapshot_delta,  tenant_id),
    )

    # _build_attention is synchronous and needs kpis + incident_health,
    # so it runs after the gather resolves.
    attention = _build_attention(kpis, incident_health)  # type: ignore[arg-type]

    return DashboardResponse(
        kpis=kpis,
        risks_by_level=risks_by_level,
        risks_by_category=risks_by_category,
        top_risks=top_risks,
        top_open_incidents=top_open_incidents,
        residual_trend=residual_trend,
        incident_velocity=incident_velocity,
        incident_health=incident_health,
        total_incidents=total_incidents,
        lifecycle=lifecycle,
        avg_resolution=avg_resolution,
        activity_feed=activity_feed,
        attention=attention,
        snapshot_delta=snapshot_delta,
    )


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

    return KPISummary(
        total_risks=int(risk_row.total or 0),
        high_risks=int(risk_row.high or 0),
        open_incidents=int(open_inc or 0),
        risk_severity_avg=round(float(risk_row.avg_residual or 0), 1),
        control_effectiveness_avg=round(float(risk_row.avg_ctrl or 0), 1),
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
            case((Incident.severity == "Critical", 0), else_=1),
            case((Incident.severity == "High", 0), else_=1),
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
    row = (await db.execute(
        select(
            func.count(Incident.id).label("total"),
            func.sum(
                case(
                    (
                        Incident.status.notin_(["Resolved", "Closed"])
                        & Incident.severity.in_(["High", "Critical"]),
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
                        & Incident.severity.in_(["High", "Critical"]),
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