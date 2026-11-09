# app/services/risk_status.py
"""
Single source of truth for derived risk statuses.

The dashboard, register filters, reports and AI prompts must all call these
functions rather than restating the rules. Pure functions over plain values,
no database access, so they are cheap to call per row and easy to test.
"""

import math
from datetime import date, datetime, timedelta

from app.models.matrix_config import MatrixConfig
from app.services.phase_one import compute_freshness

OPEN_MITIGATION = frozenset({"Open", "In Progress"})
EVIDENCE_WINDOW_DAYS = 365
APPETITE_NEAR_RATIO = 0.75  # same boundary as _get_kpis and the register appetite filter
CE_SCALES = (4, 5)
CE_HIGH_FRACTION = 0.75  # "high control rating" boundary, scale independent


DEFAULT_BAND_LABELS = ("Low", "Medium", "High", "Critical", "Extreme")


def band_labels(cfg: MatrixConfig | None) -> list[str]:
    """Band labels for this workspace, lowest first, trimmed to the configured band count."""
    if cfg is None:
        return list(DEFAULT_BAND_LABELS[:4])
    count = int(cfg.band_count or 4)  # type: ignore[arg-type]
    labels = [
        str(cfg.band_1_label or "Low"),
        str(cfg.band_2_label or "Medium"),
        str(cfg.band_3_label or "High"),
        str(cfg.band_4_label or "Critical"),
        str(cfg.band_5_label or "Extreme"),
    ]
    return labels[:count]


def band_count(cfg: MatrixConfig | None) -> int:
    return int(cfg.band_count or 4) if cfg is not None else 4  # type: ignore[arg-type]


def band_for_score(score: float, cfg: MatrixConfig | None) -> tuple[int, str]:
    """(level_index, label) for a score on the workspace bands.

    The one banding rule. Inherent severity and residual both use it.
    """
    if cfg is None:
        if score >= 17:
            return 4, "Critical"
        if score >= 10:
            return 3, "High"
        if score >= 5:
            return 2, "Medium"
        return 1, "Low"
    bc = band_count(cfg)
    # Descending: highest band first. Skip bands beyond band_count.
    band_defs = [
        (5, int(cfg.band_extreme_min or 0),  str(cfg.band_5_label or "Extreme")),  # type: ignore[arg-type]
        (4, int(cfg.band_critical_min or 0), str(cfg.band_4_label or "Critical")), # type: ignore[arg-type]
        (3, int(cfg.band_high_min or 0),     str(cfg.band_3_label or "High")),     # type: ignore[arg-type]
        (2, int(cfg.band_medium_min or 0),   str(cfg.band_2_label or "Medium")),   # type: ignore[arg-type]
    ]
    for idx, threshold, label in band_defs:
        if idx <= bc and score >= threshold:
            return idx, label
    return 1, str(cfg.band_1_label or "Low")  # type: ignore[arg-type]


def elevated_min_index(bands: int) -> int:
    """Lowest band index counted as elevated: the top two bands, never below band 2."""
    return max(bands - 1, 2)


def is_elevated_index(level_index: int, bands: int) -> bool:
    return level_index >= elevated_min_index(bands)


def elevated_phrase(cfg: MatrixConfig | None) -> str:
    """The elevated band names in words, e.g. 'High or Critical'."""
    top = band_labels(cfg)[elevated_min_index(band_count(cfg)) - 1:]
    if not top:
        return "elevated"
    return " or ".join(top)


def residual_max(cfg: MatrixConfig | None) -> int:
    """Highest possible score on this workspace's matrix. 25 (5x5) when config is absent."""
    if cfg is None:
        return 25
    return int(cfg.likelihood_scale) * int(cfg.impact_scale)  # type: ignore[arg-type]


def ce_fraction(level: int | None, scale: int) -> float | None:
    """Control effectiveness level as a 0 to 1 fraction. None means not assessed."""
    if level is None:
        return None
    if scale not in CE_SCALES:
        raise ValueError(f"Unsupported control effectiveness scale: {scale}")
    if level < 0 or level > scale:
        raise ValueError(f"Control effectiveness {level} is outside 0 to {scale}")
    return level / scale


def ce_avg_pct(avg_level: float | None, scale: int) -> float:
    """Average control effectiveness level as 0 to 100 on the workspace scale. Read-side, no range check."""
    if avg_level is None or scale <= 0:
        return 0.0
    return avg_level / scale * 100


def is_high_control(control_effectiveness: int | None, scale: int) -> bool:
    """High control rating: fraction of the scale >= CE_HIGH_FRACTION."""
    return control_effectiveness is not None and ce_avg_pct(float(control_effectiveness), scale) >= CE_HIGH_FRACTION * 100


def high_control_min(scale: int) -> int:
    """Lowest level that is_high_control treats as high on this scale."""
    return math.ceil(CE_HIGH_FRACTION * scale)


def high_control_text(scale: int) -> str:
    """The high-rating levels in words: '4 or 5' on a 5-level scale, '3 or 4' on a 4-level scale."""
    low = high_control_min(scale)
    if low >= scale:
        return str(scale)
    if scale - low == 1:
        return f"{low} or {scale}"
    return f"{low} to {scale}"


def ce_label(level: int | None, labels: dict[str, str]) -> str:
    """Display label for a level. Blank labels fall back to the number."""
    if level is None:
        return 'Not assessed'
    return (labels.get(str(level)) or '').strip() or str(level)


def resolve_ce_input(raw: int | str | None, scale: int, labels: dict[str, str]) -> int | None:
    """Import value to a level: a number or a label, case-insensitive. Blank or 'Not assessed' means null."""
    if raw is None:
        return None
    text = str(raw).strip()
    if text == '' or text.casefold() == 'not assessed':
        return None
    if text.lstrip('-').isdigit():
        level = int(text)
    else:
        matches = [
            int(k) for k, v in labels.items()
            if v.strip() and v.strip().casefold() == text.casefold() and int(k) <= scale
        ]
        if not matches:
            raise ValueError(f'Control effectiveness "{text}" is not a level or label in this workspace.')
        level = matches[0]
    if level < 0 or level > scale:
        raise ValueError(f'Control effectiveness {level} is outside 0 to {scale}.')
    return level


def appetite_status(residual: float | None, threshold: float | None) -> str | None:
    """'within', 'near' or 'exceeds'. None when either value is missing."""
    if residual is None or threshold is None:
        return None
    if residual > threshold:
        return "exceeds"
    if residual > threshold * APPETITE_NEAR_RATIO:
        return "near"
    return "within"


def threshold_for(category: str | None, thresholds: dict[str, float]) -> float | None:
    """The appetite threshold that applies to a risk: exact category match, none for a blank category."""
    if category is None or not category.strip():
        return None
    return thresholds.get(category)


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


def is_contradicted(control_effectiveness: int | None, scale: int, materialised: bool) -> bool:
    """Rated well controlled, yet produced an incident."""
    return materialised and is_high_control(control_effectiveness, scale)