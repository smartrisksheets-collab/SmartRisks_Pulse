# app/services/risk_status.py
"""
Single source of truth for derived risk statuses.

The dashboard, register filters, reports and AI prompts must all call these
functions rather than restating the rules. Pure functions over plain values,
no database access, so they are cheap to call per row and easy to test.
"""

from datetime import date, datetime, timedelta

from app.services.phase_one import compute_freshness

OPEN_MITIGATION = frozenset({"Open", "In Progress"})
EVIDENCE_WINDOW_DAYS = 365
HIGH_CONTROL_RATING = 4
APPETITE_NEAR_RATIO = 0.75  # same boundary as _get_kpis and the register appetite filter


def appetite_status(residual: float | None, threshold: float | None) -> str | None:
    """'within', 'near' or 'exceeds'. None when either value is missing."""
    if residual is None or threshold is None:
        return None
    if residual > threshold:
        return "exceeds"
    if residual > threshold * APPETITE_NEAR_RATIO:
        return "near"
    return "within"


def is_stale(last_reviewed_at: datetime | None, logged_at: date | None) -> bool:
    """Same rule as the register's Freshness column, computed live."""
    return compute_freshness(last_reviewed_at, logged_at) == "Stale"


def is_undecided(
    *,
    is_elevated: bool,
    appetite: str | None,
    linked_decision: str | None,
    mitigation_status: str | None,
) -> bool:
    """A risk that matters and has no recorded decision.

    Matters: elevated, or outside appetite. Accepted counts as a decision.
    """
    if (mitigation_status or "") == "Accepted":
        return False
    if linked_decision is not None and linked_decision.strip():
        return False
    return is_elevated or appetite == "exceeds"


def is_past_target(
    *,
    target_date: date | None,
    mitigation_status: str | None,
    today: date,
) -> bool:
    """Target date passed while treatment is still open."""
    if target_date is None:
        return False
    return target_date < today and (mitigation_status or "Open") in OPEN_MITIGATION


def has_recent_test(control_last_tested: date | None, today: date) -> bool:
    if control_last_tested is None:
        return False
    return control_last_tested >= today - timedelta(days=EVIDENCE_WINDOW_DAYS)


# Must match the assertion source options in RiskForm.tsx.
INDEPENDENT_SOURCES = frozenset({"Independently tested", "External audit"})


def is_independent(control_assertion_source: str | None) -> bool:
    """Assertion source is someone other than the risk owner. Self-assessed does not count."""
    return (control_assertion_source or "").strip() in INDEPENDENT_SOURCES


def is_evidenced(
    *,
    control_last_tested: date | None,
    control_assertion_source: str | None,
    today: date,
) -> bool:
    """Tested within the evidence window, and asserted independently of the risk owner."""
    return has_recent_test(control_last_tested, today) and is_independent(control_assertion_source)


def is_contradicted(control_effectiveness: int | None, materialised: bool) -> bool:
    """Rated well controlled, yet produced an incident."""
    return materialised and control_effectiveness is not None and control_effectiveness >= HIGH_CONTROL_RATING