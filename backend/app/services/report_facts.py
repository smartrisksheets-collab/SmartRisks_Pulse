# app/services/report_facts.py
"""
Deterministic fact/evidence layer for the Report Builder.

Architecture contract:
  - This module never calls the AI.
  - Every metric in the PDF or AI narrative originates here.
  - report.py fetches data and orchestrates blocks.
  - pdf_report.py renders the decisions already made here.
  - ai_report.py writes prose constrained by the fact slice from here.
  - None of those layers recalculate a figure that already exists here.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from app.services.report import ReportContext, RiskRow

# Pulse multiplicative residual model.
# control_effectiveness 1-5 maps to a percentage reduction in inherent severity.
CONTROL_EFFECTIVENESS_PCT: dict[int, float] = {
    1: 0.20,
    2: 0.40,
    3: 0.60,
    4: 0.80,
    5: 1.00,
}

SMALL_N_THRESHOLD = 5     # below this, percentage framing is suppressed
OVERDUE_DAYS      = 30    # decisions older than this are flagged overdue


def _pulse_residual(r: RiskRow) -> float:
    """Residual under the Pulse multiplicative engine.
    Returns full severity when control_effectiveness is 0 (unrated)."""
    if r.control_effectiveness <= 0 or r.severity_raw <= 0:
        return r.severity_raw
    ce_pct = CONTROL_EFFECTIVENESS_PCT.get(r.control_effectiveness, 0.0)
    return round(r.severity_raw * (1.0 - ce_pct), 1)


@dataclass
class ReportFacts:
    """
    Authoritative fact set for one report run.

    All blocks read from this object.
    The PDF renderer and AI narrative receive values computed here,
    never their own calculations.
    """
    ctx: ReportContext

    counts:     dict[str, Any] = field(default_factory=dict)
    scores:     dict[str, Any] = field(default_factory=dict)
    governance: dict[str, Any] = field(default_factory=dict)
    assurance:  dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        risks = self.ctx.all_risks
        n     = len(risks)
        today = date.today()

        # ── Counts ──────────────────────────────────────────────────────────
        by_level:     dict[str, int] = {}
        by_category:  dict[str, int] = {}
        by_treatment: dict[str, int] = {}
        for r in risks:
            lv = r.level or "Unknown"
            by_level[lv]          = by_level.get(lv, 0) + 1
            by_category[r.category] = by_category.get(r.category, 0) + 1
            tr = r.treatment or "Unknown"
            by_treatment[tr]      = by_treatment.get(tr, 0) + 1

        elevated    = sum(1 for r in risks if r.is_elevated)
        owners_set  = {r.owner for r in risks if r.owner}
        created_in_period = sum(
            1 for r in risks
            if r.logged_at is not None
            and self.ctx.date_from is not None
            and self.ctx.date_from <= r.logged_at <= self.ctx.date_to
        )

        self.counts = {
            "active":            n,
            "elevated":          elevated,
            "owners":            len(owners_set),
            "by_level":          by_level,
            "by_category":       by_category,
            "by_treatment":      by_treatment,
            "created_in_period": created_in_period,
        }

        # ── Scores ──────────────────────────────────────────────────────────
        residuals  = [r.residual      for r in risks if r.residual > 0]
        severities = [r.severity_raw  for r in risks if r.severity_raw > 0]
        ctrl_vals  = [r.control_effectiveness for r in risks if r.control_effectiveness > 0]
        pulse_vals = [_pulse_residual(r) for r in risks if r.severity_raw > 0]

        avg_residual   = round(sum(residuals)  / len(residuals),  1) if residuals  else 0.0
        avg_severity   = round(sum(severities) / len(severities), 1) if severities else 0.0
        avg_ctrl_eff   = round(sum(ctrl_vals)  / len(ctrl_vals),  1) if ctrl_vals  else 0.0
        avg_pulse      = round(sum(pulse_vals) / len(pulse_vals), 1) if pulse_vals else 0.0
        ctrl_strength  = round(avg_ctrl_eff / 5 * 100) if avg_ctrl_eff else 0
        exposure_index = min(100, round((avg_residual / 25) * 100))
        risk_health    = max(0, 100 - exposure_index)

        self.scores = {
            "avg_residual":         avg_residual,
            "avg_severity":         avg_severity,
            "avg_control_eff":      avg_ctrl_eff,
            "control_strength_pct": ctrl_strength,
            "exposure_index":       exposure_index,
            "risk_health":          risk_health,
            "avg_residual_pulse":   avg_pulse,
        }

        # ── Governance ──────────────────────────────────────────────────────
        appetite_configured = any(r.appetite_status is not None for r in risks)
        breaches   = [r for r in risks if r.appetite_status == "Exceeds"]
        near_limit = [r for r in risks if r.appetite_status == "Near"]
        within     = [r for r in risks if r.appetite_status == "Within"]

        decisions_tracked = any(r.linked_decision for r in risks)
        overdue: list[RiskRow] = []
        for r in risks:
            if r.linked_decision and r.linked_decision_at is not None:
                age = (today - r.linked_decision_at).days
                if age > OVERDUE_DAYS:
                    overdue.append(r)

        accepted = [r for r in risks if (r.treatment or "").lower() == "accept"]

        self.governance = {
            "appetite_configured": appetite_configured,
            "breaches":            breaches,
            "near_limit":          near_limit,
            "within_appetite":     within,
            "decisions_tracked":   decisions_tracked,
            "overdue":             overdue,
            "accepted":            accepted,
        }

        # ── Assurance ───────────────────────────────────────────────────────
        controls_documented = sum(1 for r in risks if r.controls)
        controls_untested   = sum(1 for r in risks if not r.control_last_tested)
        unasserted          = sum(1 for r in risks if not r.control_assertion_source)
        unquantified        = sum(1 for r in risks if not r.financial_exposure)

        logged_dates = [r.logged_at for r in risks if r.logged_at is not None]
        newest_record        = max(logged_dates) if logged_dates else today
        days_since_activity  = (today - newest_record).days

        self.assurance = {
            "controls_documented":        controls_documented,
            "controls_untested":          controls_untested,
            "unasserted":                 unasserted,
            "unquantified":               unquantified,
            "newest_record":              newest_record,
            "days_since_activity":        days_since_activity,
            "register_moved_this_period": created_in_period > 0,
        }

    # ── Guards ────────────────────────────────────────────────────────────────

    @property
    def allow_percentages(self) -> bool:
        """Percentage framing is only valid above the small-n threshold."""
        return self.counts["active"] >= SMALL_N_THRESHOLD

    @property
    def allow_trends(self) -> bool:
        """Trend language requires at least two stored snapshots."""
        return len(self.ctx.snapshots) >= 2

    @property
    def incidents_enabled(self) -> bool:
        return self.ctx.incidents_enabled

    @property
    def snapshot_count(self) -> int:
        return len(self.ctx.snapshots)

    # ── Derived views ─────────────────────────────────────────────────────────

    def pct(self, part: int) -> str:
        """'X of N (Y%)' when allow_percentages, else 'X of N'.
        Denominator always present so the reader can verify the fraction."""
        n = self.counts["active"]
        if not self.allow_percentages or n == 0:
            return f"{part} of {n}"
        return f"{part} of {n} ({round(part / n * 100)}%)"

    def top_by_residual(self, k: int = 5) -> list[RiskRow]:
        """Appetite breaches sort above all others regardless of residual.
        Within each appetite tier, sort by residual descending."""
        _order = {"Exceeds": 0, "Near": 1, "Within": 2, None: 3}
        return sorted(
            self.ctx.all_risks,
            key=lambda r: (_order.get(r.appetite_status, 3), -r.residual),
        )[:k]

    def owner_totals(self) -> list[tuple[str, int, float]]:
        """(owner, count, total_residual) sorted by total_residual desc."""
        agg: dict[str, list] = {}
        for r in self.ctx.all_risks:
            o = r.owner or "Unassigned"
            if o not in agg:
                agg[o] = [0, 0.0]
            agg[o][0] += 1
            agg[o][1] += r.residual
        return sorted(
            ((o, v[0], v[1]) for o, v in agg.items()),
            key=lambda x: -x[2],
        )

    def residual_model_matches_engine(self) -> bool:
        """True when every supplied residual agrees with the Pulse engine within 0.05."""
        eligible = [
            r for r in self.ctx.all_risks
            if r.severity_raw > 0 and r.control_effectiveness > 0
        ]
        if not eligible:
            return True
        return all(abs(r.residual - _pulse_residual(r)) < 0.05 for r in eligible)

    def supplied_model_is_subtractive(self) -> bool:
        """True when supplied residual = severity - control_effectiveness (additive subtraction)."""
        eligible = [
            r for r in self.ctx.all_risks
            if r.severity_raw > 0 and r.control_effectiveness > 0
        ]
        if not eligible:
            return False
        return all(
            abs(r.residual - (r.severity_raw - r.control_effectiveness)) < 0.05
            for r in eligible
        )

    def pulse_residuals(self) -> list[dict]:
        """Per-risk comparison of supplied vs Pulse engine residual.
        Used by the methodology block."""
        out = []
        for r in self.ctx.all_risks:
            if r.severity_raw <= 0 or r.control_effectiveness <= 0:
                continue
            pr   = _pulse_residual(r)
            diff = round(r.residual - pr, 1)
            out.append({
                "id":       r.id,
                "supplied": r.residual,
                "pulse":    pr,
                "diff":     diff,
                "status":   "Match" if abs(diff) < 0.05 else "Mismatch",
            })
        return out

    def build_fact_slice(self) -> dict:
        """
        Compact evidence object for the AI narrative layer.
        Contains only authoritative, pre-computed values.
        allow_trends and allow_percentages are explicitly included
        so the AI prompt can enforce the guard rules without recalculating.
        AI must not invent any value absent from this dict.
        """
        top = self.top_by_residual(5)
        return {
            "allow_trends":      self.allow_trends,
            "allow_percentages": self.allow_percentages,
            "snapshot_count":    self.snapshot_count,
            "incidents_enabled": self.incidents_enabled,
            "counts": {
                "active":            self.counts["active"],
                "elevated":          self.counts["elevated"],
                "owners":            self.counts["owners"],
                "created_in_period": self.counts["created_in_period"],
            },
            "scores": {
                "exposure_index":       self.scores["exposure_index"],
                "risk_health":          self.scores["risk_health"],
                "avg_residual":         self.scores["avg_residual"],
                "avg_severity":         self.scores["avg_severity"],
                "control_strength_pct": self.scores["control_strength_pct"],
            },
            "governance": {
                "appetite_configured": self.governance["appetite_configured"],
                "breach_count":        len(self.governance["breaches"]),
                "near_count":          len(self.governance["near_limit"]),
                "decisions_tracked":   self.governance["decisions_tracked"],
                "overdue_count":       len(self.governance["overdue"]),
                "accepted_count":      len(self.governance["accepted"]),
            },
            "assurance": {
                "controls_untested":          self.assurance["controls_untested"],
                "unasserted":                 self.assurance["unasserted"],
                "unquantified":               self.assurance["unquantified"],
                "days_since_activity":        self.assurance["days_since_activity"],
                "register_moved_this_period": self.assurance["register_moved_this_period"],
            },
            "top_risks": [
                {
                    "id":             r.id,
                    "category":       r.category,
                    "owner":          r.owner or None,
                    "residual":       r.residual,
                    "level":          r.level,
                    "appetite_status": r.appetite_status,
                    "treatment":      r.treatment,
                    "linked_decision": r.linked_decision or None,
                }
                for r in top
            ],
        }


def build_facts(ctx: ReportContext) -> ReportFacts:
    """Public constructor. Called from get_report_data after build_context."""
    return ReportFacts(ctx=ctx)