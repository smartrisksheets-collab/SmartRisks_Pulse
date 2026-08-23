# app/services/report.py
"""
Block compute engine for the Report Builder.
Translates Reportservice.gs logic to Python.

Source: Reportservice.gs — api_getReportData, REPORT_BLOCK_REGISTRY,
        and all compute* functions.

All compute functions receive a ReportContext dataclass and return a dict.
No database access inside compute functions — data is fetched once by
get_report_data() and passed through context.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.risk import Risk
from app.models.incident import Incident
from app.models.snapshot import SnapshotMonthly
from app.models.risk_history import RiskHistory
from app.models.matrix_config import MatrixConfig
from typing import Any

logger = logging.getLogger(__name__)

# ── Risk level helpers ─────────────────────────────────────────────────────────

_LEVEL_INDEX_COLORS = {4: "#dc2626", 3: "#ef4444", 2: "#f59e0b", 1: "#10b981"}


def _is_high(r: 'RiskRow') -> bool:  # type: ignore[return]
    return r.is_elevated


def _level_color(level: str | None) -> str:
    # kept for callers that pass raw strings; prefer _level_index_color
    l = (level or "").lower()
    if l in ("very high", "critical"): return "#dc2626"
    if l == "high":                    return "#ef4444"
    if l == "medium":                  return "#f59e0b"
    return "#10b981"


def _level_index_color(level_index: int) -> str:
    return _LEVEL_INDEX_COLORS.get(level_index, "#10b981")


def _normalize_category(raw: str | None) -> str:
    if not raw:
        return "Uncategorised"
    import re
    c = re.sub(r"\s+risks?$", "", str(raw).strip(), flags=re.IGNORECASE).strip()
    return c or "Uncategorised"


def _to_float(v: object) -> float:
    try:
        return float(v or 0)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0


def _parse_date(v: object) -> date | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    try:
        return datetime.fromisoformat(str(v)).date()
    except (ValueError, TypeError):
        return None


def _days_since(d: date | datetime | None) -> int:
    if d is None:
        return 9999
    ref = d.date() if isinstance(d, datetime) else d
    return (date.today() - ref).days


# ── Data transfer objects ──────────────────────────────────────────────────────

@dataclass
class RiskRow:
    id:               str
    category:         str
    desc:             str
    owner:            str
    level:            str
    level_index:      int
    is_elevated:      bool
    treatment:        str
    residual:         float
    movement:         str
    score_delta:      float
    logged_at:        date | None
    last_reviewed_at: date | None


@dataclass
class IncidentRow:
    id:             str
    category:       str
    severity:       str
    status:         str
    desc:           str
    reported_at:    date | None
    resolved_at:    date | None
    financial_impact: float


@dataclass
class ReportContext:
    tenant_id:     UUID
    risks:         list[RiskRow]        # filtered by date range, category normalized
    all_risks:     list[RiskRow]        # unfiltered
    incidents:     list[IncidentRow]    # filtered by date range
    all_incidents: list[IncidentRow]    # unfiltered
    date_from:     date | None
    date_to:       date
    snapshots:     list[SnapshotMonthly]  = field(default_factory=list)
    matrix_config: MatrixConfig | None   = field(default=None)


# ── DB data fetch ──────────────────────────────────────────────────────────────

async def _fetch_risks(db: AsyncSession, tenant_id: UUID) -> list[RiskRow]:
    result = await db.execute(
        select(Risk).where(Risk.tenant_id == tenant_id, Risk.deleted_at.is_(None))
    )
    rows = []
    for r in result.scalars():
        rows.append(RiskRow(
            id=str(r.id or ""),
            category=_normalize_category(str(r.category or "") or None),
            desc=str(r.description or "")[:200],
            owner=str(r.owner or ""),
            level=str(r.level or ""),
            level_index=int(r.level_index or 1),   # type: ignore[arg-type]
            is_elevated=bool(r.is_elevated or False),
            treatment=str(r.treatment or ""),
            residual=_to_float(r.residual),  # type: ignore[arg-type]
            movement=str(r.movement or "Stable"),
            score_delta=_to_float(r.score_delta),  # type: ignore[arg-type]
            logged_at=_parse_date(r.logged_at),  # type: ignore[arg-type]
            last_reviewed_at=_parse_date(r.last_reviewed_at),  # type: ignore[arg-type]
        ))
    return rows


async def _fetch_incidents(db: AsyncSession, tenant_id: UUID) -> list[IncidentRow]:
    result = await db.execute(
        select(Incident).where(Incident.tenant_id == tenant_id, Incident.deleted_at.is_(None))
    )
    rows = []
    for i in result.scalars():
        rows.append(IncidentRow(
            id=str(i.id or ""),
            category=str(i.category or ""),
            severity=str(i.severity or ""),
            status=str(i.status or ""),
            desc=str(i.description or "")[:200],
            reported_at=_parse_date(i.reported_at),  # type: ignore[arg-type]
            resolved_at=_parse_date(i.resolved_at),  # type: ignore[arg-type]
            financial_impact=_to_float(i.financial_impact),  # type: ignore[arg-type]
        ))
    return rows


async def _fetch_snapshots(db: AsyncSession, tenant_id: UUID) -> list[SnapshotMonthly]:
    result = await db.execute(
        select(SnapshotMonthly)
        .where(SnapshotMonthly.tenant_id == tenant_id)
        .order_by(SnapshotMonthly.month_key.asc())
    )
    return list(result.scalars())


def _apply_date_filter_risks(
    risks: list[RiskRow], date_from: date | None, date_to: date
) -> list[RiskRow]:
    if not date_from:
        return risks
    return [r for r in risks if r.logged_at is None or (date_from <= r.logged_at <= date_to)]


def _apply_date_filter_incidents(
    incidents: list[IncidentRow], date_from: date | None, date_to: date
) -> list[IncidentRow]:
    if not date_from:
        return incidents
    return [
        i for i in incidents
        if i.reported_at and date_from <= i.reported_at <= date_to
    ]


async def build_context(
    db: AsyncSession,
    tenant_id: UUID,
    date_from: date | None,
    date_to: date,
) -> ReportContext:
    all_risks     = await _fetch_risks(db, tenant_id)
    all_incidents = await _fetch_incidents(db, tenant_id)
    snapshots     = await _fetch_snapshots(db, tenant_id)

    _mc_row = await db.execute(
        select(MatrixConfig).where(MatrixConfig.tenant_id == tenant_id)
    )
    matrix_config = _mc_row.scalars().first()

    risks     = _apply_date_filter_risks(all_risks, date_from, date_to)
    incidents = _apply_date_filter_incidents(all_incidents, date_from, date_to)

    return ReportContext(
        tenant_id=tenant_id,
        risks=risks,
        all_risks=all_risks,
        incidents=incidents,
        all_incidents=all_incidents,
        date_from=date_from,
        date_to=date_to,
        snapshots=snapshots,
        matrix_config=matrix_config,
    )


# ── Month bucket helper ────────────────────────────────────────────────────────

def _build_month_buckets(
    date_from: date | None, date_to: date
) -> list[dict]:
    from dateutil.relativedelta import relativedelta

    start = date_from or (date_to - relativedelta(months=5)).replace(day=1)
    start = start.replace(day=1)

    buckets = []
    cursor = start
    while cursor <= date_to:
        next_month = cursor + relativedelta(months=1)
        bucket_to  = next_month.replace(day=1) - relativedelta(days=1)
        buckets.append({
            "label": cursor.strftime("%b %y"),
            "from":  cursor,
            "to":    min(bucket_to, date_to),
        })
        cursor = next_month

    return buckets


# ═══════════════════════════════════════════════════════════════════════════════
# BLOCK COMPUTE FUNCTIONS
# Source: Reportservice.gs REPORT_BLOCK_REGISTRY + compute* functions
# ═══════════════════════════════════════════════════════════════════════════════

def compute_exposure_index(ctx: ReportContext) -> dict:
    risks = ctx.risks
    if not risks:
        return {
            "score": 0, "label": "Low", "health": 100,
            "health_label": "Healthy", "health_color": "#10b981",
            "narrative": "", "no_data": True,
        }

    residuals = [r.residual for r in risks if r.residual > 0]
    avg = sum(residuals) / len(residuals) if residuals else 0.0
    score = min(100, round((avg / 25) * 100))

    label = (
        "Critical" if score >= 75 else
        "High"     if score >= 55 else
        "Moderate" if score >= 30 else
        "Low"
    )
    health = max(0, 100 - score)
    health_label = (
        "Healthy"    if health >= 76 else
        "Monitoring" if health >= 51 else
        "At Risk"    if health >= 26 else
        "Critical"
    )
    health_color = (
        "#10b981" if health >= 76 else
        "#14b8a6" if health >= 51 else
        "#f59e0b" if health >= 26 else
        "#ef4444"
    )
    crit_note = (
        " This level of exposure requires immediate attention to prevent potential "
        "operational or financial impact." if label == "Critical" else ""
    )
    narrative = (
        f"The organization's overall exposure index is {score}/100, "
        f"indicating a {label} risk environment.{crit_note}"
    )
    return {
        "score": score, "label": label, "health": health,
        "health_label": health_label, "health_color": health_color,
        "narrative": narrative,
    }


def compute_risk_snapshot(ctx: ReportContext) -> dict:
    risks = ctx.risks
    residuals = [r.residual for r in risks if r.residual > 0]
    avg_residual = round(sum(residuals) / len(residuals)) if residuals else 0

    by_level: dict[str, int] = {}
    by_treatment: dict[str, int] = {}
    for r in risks:
        lv = r.level or "Unknown"
        by_level[lv] = by_level.get(lv, 0) + 1
        tr = r.treatment or "Unknown"
        by_treatment[tr] = by_treatment.get(tr, 0) + 1

    high_count = sum(1 for r in risks if _is_high(r))

    dominant_entry = sorted(by_level.items(), key=lambda x: x[1], reverse=True)
    dominant = dominant_entry[0][0] if dominant_entry else "Mixed"

    cat_map: dict[str, int] = {}
    for r in risks:
        cat_map[r.category] = cat_map.get(r.category, 0) + 1
    top_cat_entry = sorted(cat_map.items(), key=lambda x: x[1], reverse=True)
    top_cat = top_cat_entry[0][0] if top_cat_entry else "multiple categories"

    med = sum(1 for r in risks if r.level_index == 2)
    low = sum(1 for r in risks if r.level_index == 1)
    _mc_snap = ctx.matrix_config
    _low_lbl = str(_mc_snap.band_1_label or "Low") if _mc_snap else "Low"
    _mid_lbl = str(_mc_snap.band_2_label or "Medium") if _mc_snap else "Medium"
    narrative = (
        f"A total of {len(risks)} risks are currently being tracked across the organization. "
        f"This includes {high_count} elevated, {med} {_mid_lbl.lower()}-risk, "
        f"and {low} {_low_lbl.lower()}-risk items. "
        f"The distribution reflects a {dominant} risk profile, with concentration in {top_cat}."
    )
    return {
        "total": len(risks), "high_count": high_count,
        "avg_residual": avg_residual, "by_treatment": by_treatment,
        "by_level": by_level, "narrative": narrative,
    }


def compute_key_risk_changes(ctx: ReportContext) -> dict:
    if not ctx.date_from:
        return {
            "increased": 0, "decreased": 0, "new_high_risks": 0,
            "note": "Set a date range for change tracking",
        }

    window = (ctx.date_to - ctx.date_from).days
    prior_to   = ctx.date_from
    prior_from = ctx.date_from - __import__("datetime").timedelta(days=window)

    def in_window(r: RiskRow, frm: date, to: date) -> bool:
        return r.logged_at is not None and frm <= r.logged_at <= to

    current = [r for r in ctx.all_risks if in_window(r, ctx.date_from, ctx.date_to)]
    prior   = [r for r in ctx.all_risks if in_window(r, prior_from, prior_to)]

    prior_map = {r.id: r.residual for r in prior}
    increased = decreased = new_high = 0
    for r in current:
        prev = prior_map.get(r.id)
        if prev is None:
            if _is_high(r):
                new_high += 1
        elif r.residual > prev:
            increased += 1
        elif r.residual < prev:
            decreased += 1

    direction = (
        "increased" if increased > decreased else
        "decreased" if increased < decreased else
        "remained stable"
    )
    narrative = (
        f"Risk levels have {direction} during the reporting period. "
        f"A total of {increased} risks increased in severity, while {decreased} decreased. "
        f"Additionally, {new_high} new high-risk item{'s were' if new_high != 1 else ' was'} identified."
    )
    if increased > decreased:
        narrative += " This indicates a net upward shift in exposure that may require reassessment of controls."
    if new_high > 0:
        narrative += " Newly identified high-risk items highlight emerging vulnerabilities."

    return {"increased": increased, "decreased": decreased, "new_high_risks": new_high, "narrative": narrative}


def compute_incident_stability(ctx: ReportContext) -> dict:
    incidents = ctx.incidents
    if not incidents:
        return {"total": 0, "open": 0, "closed": 0, "mttr_days": None, "by_severity": {}}

    def is_closed(i: IncidentRow) -> bool:
        return i.status.lower().strip() in ("resolved", "closed")

    open_   = [i for i in incidents if not is_closed(i)]
    closed_ = [i for i in incidents if is_closed(i)]

    total_days = mttr_count = 0
    for i in closed_:
        reported = _parse_date(i.reported_at)
        resolved = _parse_date(i.resolved_at)
        if reported is not None and resolved is not None:
            delta = (resolved - reported).days
            if delta > 0:
                total_days += delta
                mttr_count += 1

    mttr_days = round(total_days / mttr_count, 1) if mttr_count else None

    by_severity: dict[str, int] = {}
    for i in incidents:
        s = i.severity or "Unknown"
        by_severity[s] = by_severity.get(s, 0) + 1

    top_sev = sorted(by_severity.items(), key=lambda x: x[1], reverse=True)
    area = top_sev[0][0] if top_sev else "General"

    sorted_inc = sorted(incidents, key=lambda i: i.reported_at or date.min)
    half = len(sorted_inc) // 2
    trend = (
        "an increase" if len(sorted_inc[half:]) > len(sorted_inc[:half]) else
        "a decrease"  if len(sorted_inc[half:]) < len(sorted_inc[:half]) else
        "stability"
    )
    mttr_note = f" Average resolution time is {mttr_days} days." if mttr_days else ""
    narrative = (
        f"A total of {len(incidents)} incidents were recorded during the reporting period, "
        f"representing {trend} compared to the previous cycle. "
        f"Incident activity was most concentrated in {area}.{mttr_note}"
    )
    return {
        "total": len(incidents), "open": len(open_), "closed": len(closed_),
        "mttr_days": mttr_days, "by_severity": by_severity, "narrative": narrative,
    }


def compute_ai_exec_summary(ctx: ReportContext) -> dict:
    snapshot  = compute_risk_snapshot(ctx)
    stability = compute_incident_stability(ctx)
    exposure  = compute_exposure_index(ctx)

    lines = [
        f"Risk exposure is currently {exposure['label']} (score: {exposure['score']}/100) "
        f"with {snapshot['total']} active risks across the register."
    ]
    if snapshot["high_count"] > 0:
        s = "s are" if snapshot["high_count"] > 1 else " is"
        lines.append(
            f"{snapshot['high_count']} risk{s} rated High or Very High, "
            "requiring priority management attention."
        )
    top_treatment = sorted(snapshot["by_treatment"].items(), key=lambda x: x[1], reverse=True)
    if top_treatment:
        name, count = top_treatment[0]
        s = "s" if count > 1 else ""
        lines.append(f'The most common treatment strategy is "{name}" (applied to {count} risk{s}).')

    return {"paragraphs": lines}


def compute_executive_commentary(_ctx: ReportContext) -> dict:
    return {"placeholder": True, "text": ""}


def compute_exposure_trend(ctx: ReportContext) -> dict:
    buckets = _build_month_buckets(ctx.date_from, ctx.date_to)
    points = []
    for b in buckets:
        slice_ = [r for r in ctx.all_risks if r.logged_at is None or r.logged_at <= b["to"]]
        residuals = [r.residual for r in slice_ if r.residual > 0]
        avg = sum(residuals) / len(residuals) if residuals else 0.0
        score = min(100, round((avg / 25) * 100))
        points.append({"label": b["label"], "score": score})

    first = points[0]["score"] if points else 0
    last  = points[-1]["score"] if points else 0
    trend_dir = "upward" if last > first else "downward" if last < first else "stable"

    cat_map: dict[str, int] = {}
    for r in ctx.risks:
        cat_map[r.category] = cat_map.get(r.category, 0) + 1
    top_cat = sorted(cat_map.items(), key=lambda x: x[1], reverse=True)
    key_driver = top_cat[0][0] if top_cat else "risk activity"

    narrative = (
        f"The exposure trend over the reporting period shows a {trend_dir} movement, "
        f"shifting from {first} to {last}. This trend reflects changes in {key_driver}."
    )
    return {"points": points, "narrative": narrative}


def compute_residual_risk_trend(ctx: ReportContext) -> dict:
    buckets = _build_month_buckets(ctx.date_from, ctx.date_to)
    points = []
    for b in buckets:
        slice_ = [r for r in ctx.all_risks if r.logged_at is None or r.logged_at <= b["to"]]
        residuals = [r.residual for r in slice_ if r.residual > 0]
        avg = round(sum(residuals) / len(residuals)) if residuals else 0
        points.append({"label": b["label"], "avg": avg})

    first = points[0]["avg"] if points else 0
    last  = points[-1]["avg"] if points else 0
    trend_dir = "increased" if last > first else "decreased" if last < first else "remained stable"
    ctrl_stmt = (
        "controls are contributing to a gradual reduction in residual risk levels"
        if last <= first else
        "current controls may not be sufficiently reducing risk levels"
    )
    narrative = (
        f"Average residual risk has {trend_dir}, moving from {first} to {last}. "
        f"This suggests that {ctrl_stmt}."
    )
    return {"points": points, "narrative": narrative}


def compute_risk_distribution(ctx: ReportContext) -> dict:
    by_level: dict[str, int]    = {}
    by_category: dict[str, int] = {}
    for r in ctx.risks:
        lv = r.level or "Unknown"
        by_level[lv] = by_level.get(lv, 0) + 1
        by_category[r.category] = by_category.get(r.category, 0) + 1

    tot   = len(ctx.risks) or 1
    hi_ct = sum(1 for r in ctx.risks if r.is_elevated)
    lo_ct = sum(1 for r in ctx.risks if r.level_index == 1)
    me_ct = tot - hi_ct - lo_ct
    hi_pct = round(hi_ct / tot * 100)
    me_pct = round(me_ct / tot * 100)
    lo_pct = round(lo_ct / tot * 100)
    profile = (
        "high-concentration" if hi_pct > 50 else
        "elevated"           if hi_pct > 25 else
        "balanced"
    )
    mc = ctx.matrix_config
    if mc:
        count = int(mc.band_count or 4)  # type: ignore[arg-type]
        band_labels = [
            str(mc.band_1_label or "Low"),
            str(mc.band_2_label or "Medium"),
            str(mc.band_3_label or "High"),
            str(mc.band_4_label or "Critical"),
        ]
        if count >= 5:
            band_labels.append(str(mc.band_5_label or "Extreme"))
        _low_lbl = band_labels[0]
        _mid_lbl = band_labels[1]
    else:
        band_labels = ["Low", "Medium", "High", "Critical"]
        _low_lbl, _mid_lbl = "Low", "Medium"
    narrative = (
        f"The current risk distribution shows {hi_pct}% elevated, {me_pct}% {_mid_lbl.lower()}-risk, "
        f"and {lo_pct}% {_low_lbl.lower()}-risk items. This indicates a {profile} exposure profile."
    )
    if hi_pct > 25:
        narrative += " The proportion of elevated-risk items is high and increases overall exposure."

    return {
        "by_level":    by_level,
        "by_category": by_category,
        "narrative":   narrative,
        "band_labels": band_labels,
    }


def compute_incident_trend(ctx: ReportContext) -> dict:
    buckets = _build_month_buckets(ctx.date_from, ctx.date_to)
    points = []
    for b in buckets:
        count = sum(
            1 for i in ctx.all_incidents
            if i.reported_at and b["from"] <= i.reported_at <= b["to"]
        )
        points.append({"label": b["label"], "count": count})

    first = points[0]["count"] if points else 0
    last  = points[-1]["count"] if points else 0
    trend_dir = "upward" if last > first else "downward" if last < first else "stable"

    peak = max(points, key=lambda p: p["count"]) if points else {"label": "—", "count": 0}
    interp = (
        "increasing pressure on incident response capacity" if trend_dir == "upward" else
        "improving operational stability"                   if trend_dir == "downward" else
        "consistent incident activity with no notable change"
    )
    narrative = (
        f"Incident activity shows a {trend_dir} trend over time, "
        f"with peak occurrences recorded in {peak['label']}. "
        f"The pattern suggests {interp}."
    )
    return {"points": points, "narrative": narrative}


def compute_top_risks(ctx: ReportContext) -> dict:
    risks = sorted(ctx.risks, key=lambda r: r.residual, reverse=True)[:10]
    return {
        "risks": [
            {
                "id":          r.id,
                "category":    r.category,
                "desc":        r.desc[:120],
                "owner":       r.owner,
                "level":       r.level,
                "level_index": r.level_index,
                "residual":    round(r.residual),
                "treatment":   r.treatment,
                "movement":    r.movement,
                "score_delta": r.score_delta,
            }
            for r in risks
        ],
        "intro": "The following represent the highest-ranked risks based on residual impact and likelihood.",
    }


def compute_top_emerging_risks(ctx: ReportContext) -> dict:
    risks = [
        r for r in ctx.all_risks
        if _is_high(r)
        and (not ctx.date_from or (r.logged_at and ctx.date_from <= r.logged_at <= ctx.date_to))
    ]
    risks = sorted(risks, key=lambda r: r.residual, reverse=True)[:10]
    return {
        "risks": [
            {
                "id":          r.id,
                "category":    r.category,
                "desc":        r.desc[:120],
                "level":       r.level,
                "level_index": r.level_index,
                "residual":    r.residual,
                "logged":      r.logged_at.isoformat() if r.logged_at else None,
                "movement":    r.movement,
                "score_delta": r.score_delta,
            }
            for r in risks
        ],
        "intro": "Several risks have emerged or escalated significantly during the reporting period.",
    }


def compute_major_incidents(ctx: ReportContext) -> dict:
    major = [
        i for i in ctx.incidents
        if i.severity.lower().strip() in ("high", "critical", "very high")
    ][:10]
    return {
        "incidents": [
            {
                "id":           i.id,
                "date_reported": i.reported_at.isoformat() if i.reported_at else None,
                "category":     i.category,
                "severity":     i.severity,
                "status":       i.status,
                "desc":         i.desc[:120],
            }
            for i in major
        ],
        "intro": "The following high-impact incidents were recorded during the reporting period.",
    }


def compute_findings(ctx: ReportContext) -> dict:
    risks     = ctx.risks
    incidents = ctx.incidents

    high_count   = sum(1 for r in risks if _is_high(r))
    total_risks  = len(risks)
    residuals    = [r.residual for r in risks if r.residual > 0]
    avg_residual = round(sum(residuals) / len(residuals)) if residuals else 0

    open_inc = [i for i in incidents if i.status.lower().strip() not in ("resolved", "closed")]

    positive: list[str] = []
    key_risks: list[str] = []
    attention: list[str] = []

    exposure = compute_exposure_index(ctx)
    if exposure["score"] < 35:
        positive.append(
            f"Exposure index is {exposure['score']}/100 — indicating a well-managed, low-risk environment."
        )
    if not open_inc and incidents:
        positive.append("All recorded incidents are resolved — incident response and containment appear effective.")
    elif not incidents:
        positive.append("No incidents recorded during this period.")
    if total_risks > 0 and (high_count / total_risks) < 0.2:
        pct = round((high_count / total_risks) * 100)
        positive.append(
            f"High-risk concentration is within acceptable levels at {pct}% of the total risk register."
        )
    if 0 < avg_residual < 6:
        positive.append(
            f"Average residual risk is low at {avg_residual}, suggesting that control measures are operating effectively."
        )

    if total_risks > 0 and (high_count / total_risks) > 0.3:
        pct = round((high_count / total_risks) * 100)
        key_risks.append(
            f"High-risk concentration is elevated — {high_count} of {total_risks} tracked risks ({pct}%) are rated High or above."
        )
    if avg_residual > 12:
        key_risks.append(
            f"Average residual risk of {avg_residual} indicates that current controls may not be sufficiently reducing exposure."
        )

    cat_map: dict[str, int] = {}
    for r in [x for x in risks if _is_high(x)]:
        cat_map[r.category] = cat_map.get(r.category, 0) + 1
    top_cat = sorted(cat_map.items(), key=lambda x: x[1], reverse=True)
    if top_cat and top_cat[0][1] >= 3:
        name, cnt = top_cat[0]
        key_risks.append(
            f"{name} represents the highest risk concentration with {cnt} high-level items requiring focused management."
        )

    if open_inc:
        s = "s remain" if len(open_inc) > 1 else " remains"
        attention.append(
            f"{len(open_inc)} open incident{s} unresolved — timely closure is required to reduce operational exposure."
        )

    if len(incidents) >= 2:
        sorted_inc = sorted(incidents, key=lambda i: i.reported_at or date.min)
        half = len(sorted_inc) // 2
        if len(sorted_inc[half:]) > len(sorted_inc[:half]):
            attention.append(
                "Incident frequency is rising — the second half of the period recorded more incidents than the first."
            )

    if ctx.date_from:
        new_high = [
            r for r in risks
            if _is_high(r) and r.logged_at and r.logged_at >= ctx.date_from
        ]
        if len(new_high) >= 3:
            attention.append(
                f"{len(new_high)} new high-risk items were identified this period, "
                "indicating emerging vulnerabilities that require immediate attention."
            )

    if not positive and not key_risks and not attention:
        positive.append("No critical findings identified for this period. Overall risk posture appears stable.")

    findings = key_risks + attention or ["No critical findings identified for this period. Risk posture appears stable."]

    return {
        "positive_signals":   positive,
        "key_risks":          key_risks,
        "areas_for_attention": attention,
        "findings":           findings,
        "narrative":          " ".join(findings),
    }


def compute_recommendations(ctx: ReportContext) -> dict:
    fn = compute_findings(ctx)

    owner_map: dict[str, int] = {}
    for r in [x for x in ctx.risks if _is_high(x)]:
        o = r.owner or "Risk Manager"
        owner_map[o] = owner_map.get(o, 0) + 1
    top_owner = sorted(owner_map.items(), key=lambda x: x[1], reverse=True)
    top_owner_name = top_owner[0][0] if top_owner else "Risk Manager"

    has_critical = any(r.level_index >= 4 for r in ctx.risks)
    has_high     = any(_is_high(r) for r in ctx.risks)
    priority = "Critical" if has_critical else "High" if has_high else "Medium"
    due      = "7 Days"   if priority == "Critical" else "14 Days" if priority == "High" else "30 Days"

    recs: list[dict] = []

    if any("High-risk" in f for f in fn["key_risks"]):
        recs.append({
            "title": "Strengthen controls for high-risk areas",
            "priority": priority, "owner": top_owner_name, "due": due,
            "outcome": "Reduction in high-risk concentration and improved control effectiveness scores.",
            "body": (
                "Schedule an immediate review with risk owners to assess existing controls and identify gaps. "
                "Prioritise remediation actions for risks with the highest residual exposure."
            ),
        })

    if ctx.date_from:
        emerging = [
            r for r in ctx.all_risks
            if _is_high(r) and r.logged_at and r.logged_at >= ctx.date_from
        ]
        if emerging:
            s = "s" if len(emerging) > 1 else ""
            recs.append({
                "title": f"Proactively address {len(emerging)} emerging high-risk item{s}",
                "priority": "High", "owner": top_owner_name, "due": "14 Days",
                "outcome": "Prevention of further risk escalation and reduced future exposure.",
                "body": (
                    "Review newly identified high-risk items and assign owners with clear action plans. "
                    "Early intervention reduces the likelihood of these risks becoming critical."
                ),
            })

    if any("Incident frequency" in f for f in fn["areas_for_attention"]):
        recs.append({
            "title": "Improve incident monitoring and response protocols",
            "priority": "High", "owner": "Operations Lead", "due": "30 Days",
            "outcome": "Reduction in incident frequency and improved mean time to resolution.",
            "body": (
                "Review incident-prone processes and implement additional monitoring controls. "
                "Conduct a root cause analysis of recurring incident categories to address systemic gaps."
            ),
        })

    if not recs:
        recs.append({
            "title": "Maintain current risk management practices",
            "priority": "Medium", "owner": top_owner_name, "due": "30 Days",
            "outcome": "Sustained risk posture stability and continued control effectiveness.",
            "body": (
                "Continue the current risk review cadence and ensure all risk owners update their assessments "
                "on schedule. Monitor for any emerging trends that may require escalation."
            ),
        })

    return {
        "recommendations": recs,
        "intro": "Based on the current risk profile, the following actions are recommended:",
    }


def compute_conclusion(ctx: ReportContext) -> dict:
    exposure  = compute_exposure_index(ctx)
    snapshot  = compute_risk_snapshot(ctx)
    focus = []
    if snapshot["high_count"] > 0:
        focus.append("high-risk item management")
    if ctx.incidents:
        focus.append("incident response")
    focus_text = " and ".join(focus) if focus else "ongoing risk monitoring"
    text = (
        f"Overall, the organization's risk posture remains {exposure['label']}, "
        f"with key areas requiring attention in {focus_text}. "
        "Continued focus on control effectiveness and risk monitoring will be "
        "critical in maintaining stability."
    )
    return {"status": exposure["label"], "focus_text": focus_text, "text": text}


def compute_risk_ownership(ctx: ReportContext) -> dict:
    risks = ctx.risks
    if not risks:
        return {"top_owners": [], "concentration": 0, "all_high_count": 0, "narrative": ""}

    owner_map: dict[str, dict] = {}
    for r in risks:
        o = r.owner or "Unassigned"
        if o not in owner_map:
            owner_map[o] = {"owner": o, "total": 0, "high": 0, "residuals": [], "categories": {}}
        owner_map[o]["total"] += 1
        if _is_high(r):
                owner_map[o]["high"] += 1
        if r.residual > 0:
            owner_map[o]["residuals"].append(r.residual)
        owner_map[o]["categories"][r.category] = owner_map[o]["categories"].get(r.category, 0) + 1

    all_high = sum(1 for r in risks if _is_high(r))
    sorted_owners = sorted(
        owner_map.values(), key=lambda x: (-x["high"], -x["total"])
    )[:8]

    top_owners = []
    for o in sorted_owners:
        res = o["residuals"]
        avg_res = round(sum(res) / len(res)) if res else 0
        top_cat_e = sorted(o["categories"].items(), key=lambda x: x[1], reverse=True)
        top_owners.append({
            "owner":       o["owner"],
            "high_count":  o["high"],
            "total_count": o["total"],
            "avg_residual": avg_res,
            "top_category": top_cat_e[0][0] if top_cat_e else "",
        })

    top3_high     = sum(o["high_count"] for o in top_owners[:3])
    concentration = round((top3_high / all_high) * 100) if all_high else 0

    narrative = ""
    if top_owners:
        top = top_owners[0]
        s = "s" if top["high_count"] != 1 else ""
        narrative = f"{top['owner']} carries the highest risk load with {top['high_count']} high-level item{s}."
        if concentration > 50 and len(top_owners) >= 3:
            n = min(3, len(top_owners))
            narrative += (
                f" The top {n} owners account for {concentration}% of all high-risk items, "
                "indicating ownership concentration that may require redistribution or additional support."
            )

    return {
        "top_owners": top_owners,
        "concentration": concentration,
        "all_high_count": all_high,
        "narrative": narrative,
    }


def compute_incident_analytics(ctx: ReportContext) -> dict:
    incidents = ctx.incidents
    if not incidents:
        return {
            "total": 0, "open": 0, "closed": 0, "mttr_days": None,
            "by_category": {}, "by_severity": {}, "total_financial": 0,
            "critical_count": 0, "narrative": "No incidents recorded during this period.",
        }

    def is_open(i: IncidentRow) -> bool:
        return i.status.lower().strip() not in ("resolved", "closed")

    open_  = [i for i in incidents if is_open(i)]
    closed = [i for i in incidents if not is_open(i)]

    total_days = mttr_count = 0
    for i in closed:
        reported = _parse_date(i.reported_at)
        resolved = _parse_date(i.resolved_at)
        if reported is not None and resolved is not None:
            delta = (resolved - reported).days
            if delta > 0:
                total_days += delta
                mttr_count += 1

    mttr_days = round(total_days / mttr_count, 1) if mttr_count else None

    by_cat: dict[str, int] = {}
    by_sev: dict[str, int] = {}
    for i in incidents:
        c = i.category or "Uncategorised"
        s = i.severity  or "Unknown"
        by_cat[c] = by_cat.get(c, 0) + 1
        by_sev[s] = by_sev.get(s, 0) + 1

    total_fin    = sum(i.financial_impact for i in incidents)
    crit_count   = sum(1 for i in incidents if i.severity.lower().strip() in ("high", "critical"))
    top_cat      = sorted(by_cat.items(), key=lambda x: x[1], reverse=True)

    narrative = f"{len(incidents)} incidents recorded during the period."
    if top_cat:
        name, cnt = top_cat[0]
        s = "s" if cnt > 1 else ""
        narrative += f" {name} is the leading category with {cnt} incident{s}."
    if crit_count:
        s = "s require" if crit_count > 1 else " requires"
        narrative += f" {crit_count} high or critical incident{s} priority attention."
    if mttr_days:
        narrative += f" Average resolution time is {mttr_days} days."
    if not open_ and incidents:
        narrative += " All incidents are resolved."
    elif open_:
        s = "s" if len(open_) > 1 else ""
        narrative += f" {len(open_)} remain{'' if len(open_) > 1 else 's'} open."

    return {
        "total": len(incidents), "open": len(open_), "closed": len(closed),
        "mttr_days": mttr_days, "by_category": by_cat, "by_severity": by_sev,
        "total_financial": float(total_fin), "critical_count": crit_count,
        "narrative": narrative,
    }


def compute_executive_dashboard(ctx: ReportContext) -> dict:
    risks = ctx.risks
    if not risks:
        return {
            "no_data": True, "kpis": [],
            "posture": {"status": "No Data", "trend": "Stable", "confidence": "Low"},
            "bullets": [
                "No risks were found for the selected date range. "
                "Try widening the filter or verify that risks have been added to the register."
            ],
        }

    exposure = compute_exposure_index(ctx)
    snapshot = compute_risk_snapshot(ctx)
    krc      = compute_key_risk_changes(ctx)

    # Snapshot delta from stored monthly snapshots
    prev_exposure: int | None = None
    prev_high:     int | None = None
    has_snapshot = False

    if len(ctx.snapshots) >= 2:
        prev_snap    = ctx.snapshots[-2]
        prev_avg_res  = _to_float(prev_snap.avg_residual)  # type: ignore[arg-type]
        prev_exposure = min(100, round((prev_avg_res / 25) * 100))
        _hrc          = prev_snap.high_risk_count
        prev_high     = int(_hrc) if _hrc is not None else None  # type: ignore[arg-type]
        has_snapshot  = True

    dir_score: str | None = None
    dir_high:  str | None = None
    if prev_exposure is not None:
        dir_score = "down" if exposure["score"] < prev_exposure else "up" if exposure["score"] > prev_exposure else "stable"
    if prev_high is not None:
        dir_high = "down" if snapshot["high_count"] < prev_high else "up" if snapshot["high_count"] > prev_high else "stable"

    # Health direction is inverted (down score = up health)
    dir_health: str | None = None
    if dir_score == "down":
        dir_health = "up"
    elif dir_score == "up":
        dir_health = "down"
    elif dir_score == "stable":
        dir_health = "stable"

    kpis = [
        {"label": "Risk Health",      "value": exposure["health"],  "unit": "/100", "color": exposure["health_color"], "direction": dir_health, "prev": None},
        {"label": "Exposure Index",   "value": exposure["score"],   "unit": "/100", "color": "#1F2854",                "direction": dir_score,  "prev": prev_exposure},
        {"label": "Total Risks",      "value": snapshot["total"],   "unit": "",     "color": "#1F2854",                "direction": None,       "prev": None},
        {"label": "High Risks",       "value": snapshot["high_count"], "unit": "", "color": "#ef4444",                "direction": dir_high,   "prev": prev_high},
        {"label": "Avg Residual",     "value": snapshot["avg_residual"], "unit": "","color": "#64748b",               "direction": None,       "prev": None},
    ]

    trend_dir = (
        "Improving" if dir_score == "down" else
        "Worsening" if dir_score == "up"   else
        "Stable"
    )
    posture = {
        "status":     exposure["label"],
        "trend":      trend_dir,
        "confidence": "High" if has_snapshot else "Medium",
    }

    bullets: list[str] = []
    if prev_exposure is not None:
        if exposure["score"] < prev_exposure:
            bullets.append(
                "Risk controls are demonstrating measurable effectiveness this period, "
                "creating a window to consolidate gains and raise the baseline before the next review cycle."
            )
        elif exposure["score"] > prev_exposure:
            bullets.append(
                "The organisation's risk exposure has worsened this period, indicating that current controls "
                "are not keeping pace with emerging threats. Leadership intervention is needed to prevent further deterioration."
            )

    if (krc.get("new_high_risks") or 0) > 0:
        bullets.append(
            "Risks have escalated into elevated risk bands this period. Without prompt owner engagement "
            "and control reinforcement, these exposures risk becoming board-level concerns."
        )

    cat_map: dict[str, int] = {}
    for r in risks:
        cat_map[r.category] = cat_map.get(r.category, 0) + 1
    top_cat = sorted(cat_map.items(), key=lambda x: x[1], reverse=True)
    if top_cat:
        name = top_cat[0][0]
        bullets.append(
            f"{name} carries the deepest concentration of risk in the register. "
            "A systemic weakness in this area could amplify losses across multiple strategic objectives "
            "if not structurally addressed."
        )

    if snapshot["high_count"] > 0 and snapshot["total"] > 0 and (snapshot["high_count"] / snapshot["total"]) > 0.3:
        bullets.append(
            "A significant share of active risks are rated High or above, signalling that existing controls "
            "are insufficient to protect the organisation's strategic objectives. Structured remediation is required this period."
        )

    if not bullets:
        bullets.append(
            "Risk posture is stable this period. Leadership should use this window to stress-test existing "
            "controls against forward-looking scenarios before conditions change."
        )

    return {
        "kpis":          kpis,
        "posture":       posture,
        "bullets":       bullets,
        "prev_exposure": prev_exposure,
        "has_snapshot":  has_snapshot,
    }


def compute_key_risk_movements(ctx: ReportContext) -> dict:
    empty = {
        "has_data": False,
        "escalations": [], "reductions": [], "new_risks": [], "removed_risks": [],
        "prev_month_label": "", "curr_month_label": "",
        "narrative": (
            "Risk movement data is not yet available. "
            "Capture the risk history snapshot for at least two months to enable movement tracking."
        ),
    }

    snaps = ctx.snapshots
    if len(snaps) < 2:
        return empty

    # Key risk movements require level history storage that extends beyond the current
    # risk_history schema (residual_score only). Return has_data: False until a dedicated
    # level-change history table is added in a future phase.
    return empty


# ═══════════════════════════════════════════════════════════════════════════════
# BLOCK REGISTRY
# ═══════════════════════════════════════════════════════════════════════════════

BLOCK_REGISTRY: dict[str, Any] = {
    "exposure-index":      compute_exposure_index,
    "risk-snapshot":       compute_risk_snapshot,
    "key-risk-changes":    compute_key_risk_changes,
    "incident-stability":  compute_incident_stability,
    "ai-exec-summary":     compute_ai_exec_summary,
    "executive-commentary": compute_executive_commentary,
    "exposure-trend":      compute_exposure_trend,
    "residual-risk-trend": compute_residual_risk_trend,
    "risk-distribution":   compute_risk_distribution,
    "incident-trend":      compute_incident_trend,
    "top-risks":           compute_top_risks,
    "top-emerging-risks":  compute_top_emerging_risks,
    "major-incidents":     compute_major_incidents,
    "findings":            compute_findings,
    "recommendations":     compute_recommendations,
    "conclusion":          compute_conclusion,
    "risk-ownership":      compute_risk_ownership,
    "incident-analytics":  compute_incident_analytics,
    "executive-dashboard": compute_executive_dashboard,
    "key-risk-movements":  compute_key_risk_movements,
}


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

async def get_report_data(
    db: AsyncSession,
    tenant_id: UUID,
    blocks: list[str],
    date_from: date | None,
    date_to: date,
) -> dict:
    ctx = await build_context(db, tenant_id, date_from, date_to)

    requested = blocks or list(BLOCK_REGISTRY.keys())
    block_data: dict[str, object] = {}
    errors:     dict[str, str]    = {}

    for key in requested:
        fn = BLOCK_REGISTRY.get(key)
        if not fn:
            errors[key] = f"Unknown block: {key}"
            continue
        try:
            block_data[key] = fn(ctx)
        except Exception as exc:
            logger.error("Block compute error [%s]: %s", key, exc, exc_info=True)
            errors[key] = str(exc)

    return {
        "block_data": block_data,
        "errors":     errors,
        "meta": {
            "generated_at":   datetime.now(timezone.utc).isoformat(),
            "date_from":      date_from.isoformat() if date_from else None,
            "date_to":        date_to.isoformat(),
            "risk_count":     len(ctx.risks),
            "incident_count": len(ctx.incidents),
        },
    }


# ── Template helpers ──────────────────────────────────────────────────────────

async def list_templates(db: AsyncSession, tenant_id: UUID) -> list[dict]:
    from app.models.report_template import ReportTemplate
    result = await db.execute(
        select(ReportTemplate)
        .where(ReportTemplate.tenant_id == tenant_id)
        .order_by(ReportTemplate.updated_at.desc())
    )
    return [
        {
            "template_id": str(t.id),
            "name":        t.name,
            "description": t.description or "",
            "report_type": t.report_type or "",
            "blocks":      t.blocks or [],
            "settings":    t.settings or {},
            "is_default":  t.is_default,
            "created_by":  t.created_by or "",
            "updated_at":  t.updated_at.isoformat() if t.updated_at is not None else "",  # type: ignore[union-attr]
        }
        for t in result.scalars()
    ]


async def save_template(
    db: AsyncSession,
    tenant_id: UUID,
    payload: dict,
    created_by: str,
) -> dict:
    from app.models.report_template import ReportTemplate
    from datetime import datetime as dt

    tmpl = ReportTemplate(
        tenant_id=tenant_id,
        name=payload["name"],
        description=payload.get("description", ""),
        report_type=payload.get("report_type", ""),
        blocks=payload.get("blocks", []),
        settings=payload.get("settings", {}),
        is_default=False,
        created_by=created_by,
        updated_at=dt.now(timezone.utc),
    )
    db.add(tmpl)
    await db.flush()
    return {"template_id": str(tmpl.id)}


async def get_template(db: AsyncSession, tenant_id: UUID, template_id: str) -> dict | None:
    from app.models.report_template import ReportTemplate
    import uuid as uuid_mod
    try:
        uid = uuid_mod.UUID(template_id)
    except ValueError:
        return None
    result = await db.get(ReportTemplate, uid)
    if result is None or str(result.tenant_id) != str(tenant_id):
        return None
        return None
    return {
        "template_id": str(result.id),
        "name":        result.name,
        "description": result.description or "",
        "report_type": result.report_type or "",
        "blocks":      result.blocks or [],
        "settings":    result.settings or {},
        "is_default":  result.is_default,
        "created_by":  result.created_by or "",
        "updated_at":  result.updated_at.isoformat() if result.updated_at is not None else "",  # type: ignore[union-attr]
    }


async def delete_template(db: AsyncSession, tenant_id: UUID, template_id: str) -> bool:
    from app.models.report_template import ReportTemplate
    import uuid as uuid_mod
    try:
        uid = uuid_mod.UUID(template_id)
    except ValueError:
        return False
    tmpl = await db.get(ReportTemplate, uid)
    if tmpl is None or str(tmpl.tenant_id) != str(tenant_id):
        return False
    await db.delete(tmpl)
    await db.flush()
    return True


async def set_default_template(
    db: AsyncSession, tenant_id: UUID, template_id: str, report_type: str
) -> bool:
    from app.models.report_template import ReportTemplate
    import uuid as uuid_mod
    try:
        uid = uuid_mod.UUID(template_id)
    except ValueError:
        return False

    # Clear existing defaults of this report_type for this tenant
    existing = await db.execute(
        select(ReportTemplate).where(
            ReportTemplate.tenant_id == tenant_id,
            ReportTemplate.report_type == report_type,
            ReportTemplate.is_default.is_(True),
        )
    )
    for t in existing.scalars():
        t.is_default = False  # type: ignore[assignment]

    target = await db.get(ReportTemplate, uid)
    if target is None or str(target.tenant_id) != str(tenant_id):
        return False
    target.is_default = True  # type: ignore[assignment]
    await db.flush()
    return True


async def get_report_settings(db: AsyncSession, tenant_id: UUID) -> dict:
    from app.models.report_template import ReportSettings
    result = await db.execute(
        select(ReportSettings).where(ReportSettings.tenant_id == tenant_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return {}
    return dict(row.settings) if row.settings else {}  # type: ignore[arg-type]


async def save_report_settings(db: AsyncSession, tenant_id: UUID, settings: dict) -> None:
    from app.models.report_template import ReportSettings
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    stmt = (
        pg_insert(ReportSettings)
        .values(tenant_id=tenant_id, settings=settings)
        .on_conflict_do_update(
            index_elements=["tenant_id"],
            set_={"settings": settings},
        )
    )
    await db.execute(stmt)
    await db.flush()