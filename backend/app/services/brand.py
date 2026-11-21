"""Workspace brand palette.

resolve_palette() is the only code that turns a workspace's stored
primary_color and accent_color into the colors every surface uses: the app
theme, the PDF report and the PPTX deck. Colors that carry meaning (risk
bands, severity, RAG) are not part of the palette and stay fixed.
"""
import re
from dataclasses import asdict, dataclass

DEFAULT_PRIMARY = "#01B88E"
DEFAULT_ACCENT = "#1F2854"
WHITE = "#FFFFFF"
INK = "#0F172A"

# Same floors as frontend/src/utils/brand.ts. The default teal scores 2.55
# against white, so 2.5 keeps the SmartRisk look unchanged.
MIN_PRIMARY_CONTRAST = 2.5
MIN_ACCENT_CONTRAST = 4.5
# Large panels carry several light text shades, so they need a deeper accent.
MIN_PANEL_CONTRAST = 7.0
# Below this RGB distance two colors read as the same in a chart.
MIN_SERIES_DISTANCE = 80.0

_HEX_RE = re.compile(r"^#?[0-9a-fA-F]{6}$")


@dataclass(frozen=True)
class BrandPalette:
    primary: str        # fill: buttons, accent bars, chart series 2
    accent: str         # fill: header rows, cover, chart series 1
    on_primary: str     # text drawn on a primary fill
    on_accent: str      # text drawn on an accent fill
    primary_text: str   # primary used as text or a thin line on white
    accent_text: str    # accent used as title text on white
    accent_deep: str    # accent for large panels under light text
    primary_tint: str   # very light primary, for zebra rows and panels
    accent_tint: str    # very light accent
    series_2: str       # second chart color, kept apart from accent

    def to_dict(self) -> dict[str, str]:
        return asdict(self)


def _norm(value: object, fallback: str) -> str:
    s = str(value or "").strip()
    if not _HEX_RE.match(s):
        return fallback
    return "#" + s.lstrip("#").upper()


def _rgb(hex_: str) -> tuple[int, int, int]:
    n = int(hex_[1:], 16)
    return (n >> 16) & 255, (n >> 8) & 255, n & 255


def _hex(rgb: tuple[float, float, float]) -> str:
    return "#" + "".join(f"{max(0, min(255, round(c))):02X}" for c in rgb)


def _lum(hex_: str) -> float:
    def ch(v: int) -> float:
        c = v / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = _rgb(hex_)
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(a: str, b: str) -> float:
    la, lb = _lum(a), _lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def mix(a: str, b: str, weight_b: float) -> str:
    ra, rb = _rgb(a), _rgb(b)
    return _hex(tuple(x + (y - x) * weight_b for x, y in zip(ra, rb)))  # type: ignore[arg-type]


def _on_fill(fill: str, floor: float) -> str:
    """White text when it reaches the floor, else whichever of white or ink reads better."""
    if contrast(fill, WHITE) >= floor:
        return WHITE
    return INK if contrast(fill, INK) > contrast(fill, WHITE) else WHITE


def _darken_to(color: str, floor: float) -> str:
    """Darken in 5% steps until the color reaches the floor against white."""
    out = color
    step = 0
    while contrast(out, WHITE) < floor and step < 20:
        step += 1
        out = mix(color, "#000000", step * 0.05)
    return out


def _distance(a: str, b: str) -> float:
    return sum((x - y) ** 2 for x, y in zip(_rgb(a), _rgb(b))) ** 0.5


def resolve_palette(workspace_settings: dict | None) -> BrandPalette:
    ws = workspace_settings or {}
    primary = _norm(ws.get("primary_color"), DEFAULT_PRIMARY)
    accent = _norm(ws.get("accent_color"), DEFAULT_ACCENT)
    series_2 = primary
    if _distance(primary, accent) < MIN_SERIES_DISTANCE:
        # Too alike to tell apart in a chart: lighten a dark accent, darken a light one.
        series_2 = mix(accent, WHITE, 0.55) if _lum(accent) < 0.4 else mix(accent, "#000000", 0.45)
    return BrandPalette(
        primary=primary,
        accent=accent,
        on_primary=_on_fill(primary, MIN_PRIMARY_CONTRAST),
        on_accent=_on_fill(accent, MIN_ACCENT_CONTRAST),
        primary_text=_darken_to(primary, MIN_PRIMARY_CONTRAST),
        accent_text=_darken_to(accent, MIN_ACCENT_CONTRAST),
        accent_deep=_darken_to(accent, MIN_PANEL_CONTRAST),
        primary_tint=mix(primary, WHITE, 0.90),
        accent_tint=mix(accent, WHITE, 0.92),
        series_2=series_2,
    )


DEFAULT_PALETTE = resolve_palette(None)
