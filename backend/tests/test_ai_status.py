"""AI insight Status follows the workspace matrix: band position and band boundaries, never band names."""

from types import SimpleNamespace

import pytest

from app.services.risk_status import ai_status, ai_status_thresholds

_DEFAULT = dict(
    likelihood_scale=5, impact_scale=5, band_count=4,
    band_1_label="Low", band_2_label="Medium", band_3_label="High", band_4_label="Critical", band_5_label="Extreme",
    band_medium_min=5, band_high_min=10, band_critical_min=17, band_extreme_min=21,
)


def _cfg(**over: object) -> SimpleNamespace:
    return SimpleNamespace(**{**_DEFAULT, **over})


def _old_rule(level: str | None, residual: float) -> str:
    """The previous hardcoded rule, kept here to prove the default matrix is unchanged."""
    lvl = (level or "").lower()
    if lvl == "critical" or residual >= 17:
        return "Escalate"
    if lvl == "high" or residual >= 10:
        return "Monitor"
    if lvl == "medium":
        return "Review"
    return "Stable"


_LEVELS = [(1, "Low"), (2, "Medium"), (3, "High"), (4, "Critical")]


@pytest.mark.parametrize("cfg", [None, _cfg()])
def test_default_5x5_matches_previous_rule(cfg: SimpleNamespace | None) -> None:
    assert ai_status_thresholds(cfg) == (17, 10)  # type: ignore[arg-type]
    for idx, label in _LEVELS:
        for residual in range(0, 26):
            assert ai_status(idx, float(residual), cfg, label) == _old_rule(label, residual)  # type: ignore[arg-type]


def test_4x4_matrix_uses_its_own_boundaries() -> None:
    cfg = _cfg(likelihood_scale=4, impact_scale=4, band_medium_min=3, band_high_min=7, band_critical_min=12)
    assert ai_status_thresholds(cfg) == (12, 7)  # type: ignore[arg-type]
    assert ai_status(3, 12.0, cfg) == "Escalate"  # type: ignore[arg-type]
    assert ai_status(2, 7.0, cfg) == "Monitor"  # type: ignore[arg-type]
    assert ai_status(2, 6.0, cfg) == "Review"  # type: ignore[arg-type]
    assert ai_status(1, 2.0, cfg) == "Stable"  # type: ignore[arg-type]


def test_renamed_bands_go_by_position() -> None:
    cfg = _cfg(band_count=3, band_1_label="Minor", band_2_label="Moderate", band_3_label="Severe",
               band_medium_min=4, band_high_min=12)
    assert ai_status(3, 1.0, cfg, "Severe") == "Escalate"  # type: ignore[arg-type]
    assert ai_status(2, 1.0, cfg, "Moderate") == "Monitor"  # type: ignore[arg-type]
    assert ai_status(1, 1.0, cfg, "Minor") == "Stable"  # type: ignore[arg-type]
    # A band literally named "Critical" in the bottom slot gets no special treatment.
    odd = _cfg(band_1_label="Critical", band_4_label="Severe")
    assert ai_status(1, 1.0, odd, "Critical") == "Stable"  # type: ignore[arg-type]


def test_five_bands_top_two_bands_escalate() -> None:
    cfg = _cfg(band_count=5)
    assert ai_status_thresholds(cfg) == (17, 10)  # type: ignore[arg-type]
    assert ai_status(5, 21.0, cfg) == "Escalate"  # type: ignore[arg-type]
    assert ai_status(4, 18.0, cfg) == "Escalate"  # type: ignore[arg-type]
    assert ai_status(4, None, cfg) == "Escalate"  # type: ignore[arg-type]
    assert ai_status(3, 12.0, cfg) == "Monitor"  # type: ignore[arg-type]
    assert ai_status(3, None, cfg) == "Monitor"  # type: ignore[arg-type]
    assert ai_status(2, 9.0, cfg) == "Review"  # type: ignore[arg-type]
    assert ai_status(1, 4.0, cfg) == "Stable"  # type: ignore[arg-type]
    # Residual alone crosses the band boundaries of this matrix.
    assert ai_status(1, 17.0, cfg) == "Escalate"  # type: ignore[arg-type]
    assert ai_status(1, 10.0, cfg) == "Monitor"  # type: ignore[arg-type]
    # Stored labels on rows without level_index.
    assert ai_status(None, None, cfg, "Critical") == "Escalate"  # type: ignore[arg-type]
    assert ai_status(None, None, cfg, "High") == "Monitor"  # type: ignore[arg-type]


def test_two_bands() -> None:
    cfg = _cfg(band_count=2, band_medium_min=8)
    assert ai_status_thresholds(cfg) == (8, None)  # type: ignore[arg-type]
    assert ai_status(2, 1.0, cfg) == "Escalate"  # type: ignore[arg-type]
    assert ai_status(1, 7.0, cfg) == "Stable"  # type: ignore[arg-type]


def test_null_residual_and_missing_level_index() -> None:
    assert ai_status(None, None, None) == "Stable"
    assert ai_status(4, None, None) == "Escalate"
    # Existing rows without level_index: the stored label is found among the workspace bands.
    cfg = _cfg(band_3_label="Severe")
    assert ai_status(None, None, cfg, "severe") == "Monitor"  # type: ignore[arg-type]
    assert ai_status(None, None, cfg, "Unknown") == "Stable"  # type: ignore[arg-type]
    assert ai_status(None, 18.0, cfg, None) == "Escalate"  # type: ignore[arg-type]
