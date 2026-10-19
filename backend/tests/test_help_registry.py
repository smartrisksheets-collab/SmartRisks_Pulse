from app.schemas.matrix_config import MatrixConfigResponse
from app.services.help_registry import build_help
from app.services.risk_status import high_control_text

_BASE = dict(
    likelihood_scale=5, impact_scale=5, band_count=4,
    band_1_label="Low", band_2_label="Medium", band_3_label="High", band_4_label="Critical", band_5_label="Extreme",
    band_low_min=1, band_low_max=4, band_medium_min=5, band_medium_max=9, band_high_min=10, band_high_max=16,
    band_critical_min=17, band_critical_max=25, band_extreme_min=21, band_extreme_max=25,
)


def _entries(**over: object) -> dict[str, str]:
    return {e.id: (e.how or "") for e in build_help(MatrixConfigResponse(**{**_BASE, **over}))}


def test_ids_are_unique() -> None:
    ids = [e.id for e in build_help(MatrixConfigResponse(**_BASE))]
    assert len(ids) == len(set(ids)) == 18


def test_control_steps_follow_scale() -> None:
    assert "1 removes 20%" in _entries(ce_scale=5)["control-effectiveness"]
    assert "1 removes 25%" in _entries(ce_scale=4)["control-effectiveness"]


def test_matrix_size_follows_workspace() -> None:
    assert "1 to 16" in _entries(likelihood_scale=4, impact_scale=4)["residual-risk"]


def test_near_boundary_is_75() -> None:
    assert "above 75%" in _entries()["risk-appetite"]


def test_high_control_text_follows_scale() -> None:
    assert high_control_text(5) == "4 or 5"
    assert high_control_text(4) == "3 or 4"