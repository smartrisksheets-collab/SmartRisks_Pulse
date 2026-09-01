"""
Snapshot service — monthly aggregate snapshots and delta computation.
Translates SnapshotService.gs for the v2 FastAPI backend.

Monthly snapshots are written by APScheduler (Phase 11).
This module is called by:
  - The scheduler job (write snapshot for last month)
  - The dashboard route (read latest snapshot for delta)
  - A manual-trigger endpoint (POST /api/v1/snapshots/run)
"""

from datetime import datetime, timezone, date
from uuid import UUID

from sqlalchemy import select, func, case, cast, DateTime
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.snapshot import SnapshotMonthly, SnapshotDaily
from app.models.risk import Risk
from app.models.incident import Incident
from app.schemas.dashboard import SnapshotDelta
from decimal import Decimal


# ---------------------------------------------------------------------------
# Live aggregate computation (shared by dashboard and snapshot writer)
# ---------------------------------------------------------------------------

async def compute_live_kpis(
    db: AsyncSession,
    tenant_id: UUID,
) -> dict:
    """
    Compute all snapshot metrics as live SQL aggregates.
    Returns a plain dict with the same keys as SnapshotMonthly columns.
    Used both to write a new snapshot and to build the current-month delta.
    """
    now = datetime.now(timezone.utc)

    # ── Risk aggregates ─────────────────────────────────────────────────────
    risk_row = (await db.execute(
        select(
            func.count(Risk.id).label("total_risks"),
            func.sum(
                case((Risk.level.in_(["High", "Critical"]), 1), else_=0)
            ).label("high_risk_count"),
            func.avg(Risk.residual).label("avg_residual"),
            func.avg(
                case((Risk.control_effectiveness.isnot(None), Risk.control_effectiveness), else_=None)
            ).label("avg_ctrl_eff"),
        ).where(
            Risk.tenant_id == tenant_id,
            Risk.deleted_at.is_(None),
        )
    )).one()

    # ── Incident aggregates ──────────────────────────────────────────────────
    inc_row = (await db.execute(
        select(
            func.count(Incident.id).label("total"),
            func.sum(
                case((Incident.status.notin_(["Resolved", "Closed"]), 1), else_=0)
            ).label("open_incidents"),
            func.sum(Incident.financial_impact).label("financial_impact"),
        ).where(
            Incident.tenant_id == tenant_id,
            Incident.deleted_at.is_(None),
        )
    )).one()

    # ── MTTR: avg days from reported_at to resolved_at ──────────────────────
    mttr_row = (await db.execute(
        select(
            func.avg(
                func.extract(
                    "epoch",
                    Incident.resolved_at - cast(Incident.reported_at, DateTime(timezone=True)),
                ) / 86400
            ).label("avg_mttr"),
            func.count(Incident.id).label("data_points"),
        ).where(
            Incident.tenant_id == tenant_id,
            Incident.deleted_at.is_(None),
            Incident.resolved_at.isnot(None),
            Incident.reported_at.isnot(None),
        )
    )).one()

    month_key = now.strftime("%Y-%m")
    month_label = now.strftime("%b %Y")

    return {
        "month_key": month_key,
        "month_label": month_label,
        "month_date": date(now.year, now.month, 1),
        "total_risks": int(risk_row.total_risks or 0),
        "high_risk_count": int(risk_row.high_risk_count or 0),
        "avg_residual": float(risk_row.avg_residual or 0),
        "control_effectiveness": float(risk_row.avg_ctrl_eff or 0),
        "open_incidents": int(inc_row.open_incidents or 0),
        "avg_mttr": float(mttr_row.avg_mttr or 0) if mttr_row.avg_mttr else None,
        "financial_impact": float(inc_row.financial_impact or 0),
    }


# ---------------------------------------------------------------------------
# Monthly snapshot writer
# ---------------------------------------------------------------------------

async def write_monthly_snapshot(
    db: AsyncSession,
    tenant_id: UUID,
    target_month: date | None = None,
) -> SnapshotMonthly | None:
    """
    Compute and persist a monthly snapshot for the given tenant.
    target_month defaults to last month (same behaviour as GAS trigger).
    Skips silently if a row for this month_key already exists.
    """
    now = datetime.now(timezone.utc)

    if target_month is None:
        # Last month, first day
        if now.month == 1:
            target_month = date(now.year - 1, 12, 1)
        else:
            target_month = date(now.year, now.month - 1, 1)

    month_key = target_month.strftime("%Y-%m")
    month_label = target_month.strftime("%b %Y")

    # Idempotent: skip if row already exists
    existing = (await db.execute(
        select(SnapshotMonthly).where(
            SnapshotMonthly.tenant_id == tenant_id,
            SnapshotMonthly.month_key == month_key,
        )
    )).scalar_one_or_none()

    if existing:
        return existing

    kpis = await compute_live_kpis(db, tenant_id)

    snap = SnapshotMonthly(
        tenant_id=tenant_id,
        month_key=month_key,
        month_label=month_label,
        month_date=target_month,
        avg_residual=kpis["avg_residual"],
        high_risk_count=kpis["high_risk_count"],
        total_risks=kpis["total_risks"],
        control_effectiveness=kpis["control_effectiveness"],
        open_incidents=kpis["open_incidents"],
        avg_mttr=kpis["avg_mttr"],
        financial_impact=kpis["financial_impact"],
    )
    db.add(snap)
    await db.flush()
    await db.refresh(snap)
    return snap


# ---------------------------------------------------------------------------
# Snapshot delta (embedded in dashboard response)
# ---------------------------------------------------------------------------

def _pct_delta(curr: float | Decimal | None, prev: float | Decimal | None) -> float | None:
    """Compute % change from prev to curr. Returns None if prev is 0 or None.

    prev is always a stored SnapshotMonthly row, whose NUMERIC columns arrive as
    Decimal. curr is normally the live dict from compute_live_kpis, which casts
    to float. Python refuses to subtract across the two, so both are coerced
    here rather than at each of the six call sites in _build_delta_obj.
    """
    if prev is None or prev == 0:
        return None
    if curr is None:
        return None
    c = float(curr)
    p = float(prev)
    return round(((c - p) / abs(p)) * 100, 1)


def _build_delta_obj(
    prev: SnapshotMonthly | dict,
    curr: SnapshotMonthly | dict,
) -> SnapshotDelta:
    """
    Build a SnapshotDelta from two snapshot rows (ORM or dict).
    health_delta = -(avg_residual delta): rising residual = falling health.
    """
    def _get(obj, key):
        if isinstance(obj, dict):
            return obj.get(key)
        return getattr(obj, key, None)

    avg_res_delta = _pct_delta(_get(curr, "avg_residual"), _get(prev, "avg_residual"))

    prev_label = _get(prev, "month_label") or _get(prev, "month_key") or ""

    return SnapshotDelta(
        has_data=True,
        period_label=f"vs {prev_label}",
        avg_residual=avg_res_delta,
        high_risk_count=_pct_delta(_get(curr, "high_risk_count"), _get(prev, "high_risk_count")),
        total_risks=_pct_delta(_get(curr, "total_risks"), _get(prev, "total_risks")),
        control_eff=_pct_delta(_get(curr, "control_effectiveness"), _get(prev, "control_effectiveness")),
        open_incidents=_pct_delta(_get(curr, "open_incidents"), _get(prev, "open_incidents")),
        avg_mttr=_pct_delta(_get(curr, "avg_mttr"), _get(prev, "avg_mttr")),
        financial_impact=_pct_delta(_get(curr, "financial_impact"), _get(prev, "financial_impact")),
        health_delta=(-(avg_res_delta) if avg_res_delta is not None else None),
    )


async def get_snapshot_delta(
    db: AsyncSession,
    tenant_id: UUID,
) -> SnapshotDelta:
    """
    Returns delta between the baseline snapshot and current live values.

    Logic mirrors GAS api_getSnapshotDelta:
    - Get the last two stored snapshots ordered by month_key desc.
    - If the latest is the current month, compare it against the one before it
      (snapshot was written this month, use it as curr, prior row as prev).
    - If the latest is a prior month, compute live current values and compare.
    - If there is only one stored snapshot and it is already the current month,
      there is no baseline; return has_data=False.
    """
    rows = (await db.execute(
        select(SnapshotMonthly)
        .where(SnapshotMonthly.tenant_id == tenant_id)
        .order_by(SnapshotMonthly.month_key.desc())
        .limit(2)
    )).scalars().all()

    if not rows:
        return SnapshotDelta(has_data=False)

    current_month_key = datetime.now(timezone.utc).strftime("%Y-%m")
    latest = rows[0]

    if str(latest.month_key) == current_month_key:
        # Snapshot already written this month — need a prior row to compare against
        if len(rows) < 2:
            return SnapshotDelta(has_data=False)
        prev = rows[1]
        curr = latest
        return _build_delta_obj(prev, curr)
    else:
        # Latest is a prior month — compute live current and compare
        prev = latest
        curr_dict = await compute_live_kpis(db, tenant_id)
        return _build_delta_obj(prev, curr_dict)

# ---------------------------------------------------------------------------
# Daily per-risk snapshot writer and delta reader (Phase 10 — Brief Engine)
# Source: SnapshotService.gs api_captureRiskHistoryNow + api_getDailyDeltas
# ---------------------------------------------------------------------------

_BAND_ORDER: dict[str, int] = {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}


def _band_direction(from_band: str, to_band: str) -> str:
    return "up" if (_BAND_ORDER.get(to_band, 0) > _BAND_ORDER.get(from_band, 0)) else "down"


async def write_daily_snapshot(db: AsyncSession, tenant_id: UUID) -> None:
    """
    Capture current per-risk state into snapshots_daily.
    snapshot_data = {risk_id: {residual, band, control_eff, mitigation_status}}
    Idempotent: skips silently if a row for today's date_key already exists.
    Source: SnapshotService.gs api_captureRiskHistoryNow.
    """
    today_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    existing = (await db.execute(
        select(SnapshotDaily).where(
            SnapshotDaily.tenant_id == tenant_id,
            SnapshotDaily.date_key == today_key,
        )
    )).scalar_one_or_none()

    if existing:
        return

    risks = (await db.execute(
        select(
            Risk.id,
            Risk.residual,
            Risk.level,
            Risk.control_effectiveness,
            Risk.mitigation_status,
        ).where(
            Risk.tenant_id == tenant_id,
            Risk.deleted_at.is_(None),
        )
    )).all()

    snapshot_data: dict[str, dict] = {}
    for r in risks:
        snapshot_data[str(r.id)] = {
            "residual":         float(r.residual or 0),
            "band":             str(r.level or ""),
            "control_eff":      float(r.control_effectiveness or 0),
            "mitigation_status": str(r.mitigation_status or ""),
        }

    snap = SnapshotDaily(
        tenant_id=tenant_id,
        date_key=today_key,
        snapshot_data=snapshot_data,  # type: ignore[call-arg]
    )
    db.add(snap)
    await db.flush()


async def get_daily_deltas(
    db: AsyncSession,
    tenant_id: UUID,
    since_date: str,
) -> dict:
    """
    Compare snapshots from on/before since_date with the latest snapshot.
    Returns {ok, has_data, deltas} where each delta matches GAS getDailyDeltas format.
    Source: SnapshotService.gs api_getDailyDeltas.
    """
    today_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    rows = (await db.execute(
        select(SnapshotDaily).where(
            SnapshotDaily.tenant_id == tenant_id,
        ).order_by(SnapshotDaily.date_key.asc())
    )).scalars().all()

    if not rows:
        return {"ok": True, "has_data": False, "deltas": []}

    by_date: dict[str, dict] = {
        str(r.date_key): dict(r.snapshot_data or {})  # type: ignore[arg-type]
        for r in rows
    }
    available = sorted(by_date.keys())

    baseline_candidates = [d for d in available if d <= since_date]
    latest_candidates   = [d for d in available if d <= today_key]

    if not baseline_candidates or not latest_candidates:
        return {"ok": True, "has_data": False, "deltas": []}

    baseline_date = baseline_candidates[-1]
    latest_date   = latest_candidates[-1]

    if baseline_date == latest_date:
        return {"ok": True, "has_data": False, "reason": "Insufficient history", "deltas": []}

    baseline = by_date[baseline_date]
    latest   = by_date[latest_date]
    deltas: list[dict] = []

    for risk_id, cur in latest.items():
        prev = baseline.get(risk_id)
        if not prev:
            deltas.append({
                "riskId": risk_id, "type": "new",
                "band": cur["band"], "residual": cur["residual"],
                "residualDelta": None, "bandCrossed": False,
                "previousBand": None, "mitigationStatus": cur["mitigation_status"],
            })
            continue

        residual_delta = cur["residual"] - prev["residual"]
        band_crossed   = cur["band"] != prev["band"]
        status_changed = cur["mitigation_status"] != prev["mitigation_status"]

        if residual_delta != 0 or band_crossed or status_changed:
            deltas.append({
                "riskId":          risk_id,
                "type":            "band_crossing" if band_crossed else "score_change",
                "band":            cur["band"],
                "previousBand":    prev["band"],
                "residual":        cur["residual"],
                "residualDelta":   round(residual_delta, 4),
                "bandCrossed":     band_crossed,
                "bandDirection":   _band_direction(prev["band"], cur["band"]) if band_crossed else None,
                "mitigationStatus": cur["mitigation_status"],
                "controlEffDelta": cur["control_eff"] - prev["control_eff"],
            })

    for risk_id, prev in baseline.items():
        if risk_id not in latest:
            deltas.append({
                "riskId": risk_id, "type": "retired",
                "band": None, "previousBand": prev["band"],
                "residual": None, "residualDelta": None,
            })

    order = {"band_crossing": 0, "score_change": 1, "new": 2, "retired": 3}
    deltas.sort(key=lambda d: order.get(d["type"], 9))

    return {"ok": True, "has_data": len(deltas) > 0, "deltas": deltas}