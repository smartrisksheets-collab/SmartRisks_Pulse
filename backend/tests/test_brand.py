"""
backend/tests/test_brand.py

Workspace brand palette: the resolver, the settings response, and the
PDF and PPTX exports drawing in the workspace colors.
"""
import base64
import io
import logging
import re
import zlib
from concurrent.futures import ThreadPoolExecutor

import pytest
from httpx import AsyncClient
from pptx import Presentation

from app.services import pdf_report, pptx_report
from app.services.brand import (
    DEFAULT_ACCENT,
    DEFAULT_PALETTE,
    DEFAULT_PRIMARY,
    INK,
    WHITE,
    contrast,
    resolve_palette,
)

_ALL_BLOCKS = list(pdf_report._RENDERERS.keys())
_RISK = {
    "category": "Operational", "description": "Brand palette test risk",
    "owner": "Test Owner", "treatment": "Mitigate", "likelihood": 4, "impact_score": 4,
}


def _rl(hex_: str) -> str:
    """How ReportLab writes a fill color in a content stream, for example '.752941 .223529 .168627 rg'."""
    def f(v: int) -> str:
        s = f"{v / 255:.6f}".rstrip("0").rstrip(".")
        return s[1:] if s.startswith("0.") else s
    n = int(hex_[1:], 16)
    return " ".join(f((n >> sh) & 255) for sh in (16, 8, 0)) + " rg"


def _pdf_text(pdf: bytes) -> str:
    out = []
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", pdf, re.DOTALL):
        raw = m.group(1)
        try:
            if raw.rstrip().endswith(b"~>"):
                raw = base64.a85decode(raw.rstrip()[:-2].replace(b"\n", b""))
            raw = zlib.decompressobj().decompress(raw)
        except (ValueError, zlib.error):
            pass
        out.append(raw.decode("latin-1"))
    return "\n".join(out)


# ── Resolver ──────────────────────────────────────────────────────────────────

def test_defaults_for_missing_or_invalid_colors() -> None:
    for ws in (None, {}, {"primary_color": "teal", "accent_color": "#12"}, {"primary_color": None}):
        p = resolve_palette(ws)  # type: ignore[arg-type]
        assert p.primary == DEFAULT_PRIMARY
        assert p.accent == DEFAULT_ACCENT


def test_default_palette_keeps_smartrisk_look() -> None:
    p = DEFAULT_PALETTE
    assert p.on_primary == WHITE and p.on_accent == WHITE
    assert p.primary_text == DEFAULT_PRIMARY and p.accent_text == DEFAULT_ACCENT
    assert p.accent_deep == DEFAULT_ACCENT
    assert p.series_2 == DEFAULT_PRIMARY


def test_hex_without_hash_and_lowercase_is_normalised() -> None:
    p = resolve_palette({"primary_color": "c0392b", "accent_color": "#2e86c1"})
    assert p.primary == "#C0392B" and p.accent == "#2E86C1"


def test_light_colors_get_dark_text_and_darker_text_shades() -> None:
    p = resolve_palette({"primary_color": "#FFE066", "accent_color": "#F5F5F5"})
    assert p.on_primary == INK and p.on_accent == INK
    assert contrast(p.primary_text, WHITE) >= 2.5
    assert contrast(p.accent_text, WHITE) >= 4.5
    assert contrast(p.accent_deep, WHITE) >= 7.0
    # Fills keep the chosen color.
    assert p.primary == "#FFE066" and p.accent == "#F5F5F5"


def test_white_brand_color_still_resolves() -> None:
    p = resolve_palette({"primary_color": "#FFFFFF", "accent_color": "#FFFFFF"})
    assert contrast(p.accent_text, WHITE) >= 4.5
    assert p.series_2 != p.accent


def test_near_identical_colors_get_distinct_second_series() -> None:
    p = resolve_palette({"primary_color": "#1F2855", "accent_color": "#1F2854"})
    assert p.series_2 != p.primary
    assert p.series_2 != p.accent


# ── Settings response ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_settings_returns_resolved_brand(client: AsyncClient, owner_headers: dict) -> None:
    r = await client.patch(
        "/api/v1/settings",
        json={"primary_color": "#C0392B", "accent_color": "#FAFAFA"},
        headers=owner_headers,
    )
    assert r.status_code == 200
    brand = r.json()["data"]["brand"]
    assert brand["primary"] == "#C0392B"
    assert brand["on_accent"] == INK
    r = await client.get("/api/v1/settings", headers=owner_headers)
    assert r.json()["data"]["brand"]["accent"] == "#FAFAFA"
    # Restore defaults for other tests.
    await client.patch(
        "/api/v1/settings",
        json={"primary_color": "#01b88e", "accent_color": "#1F2854"},
        headers=owner_headers,
    )


# ── Exports ───────────────────────────────────────────────────────────────────

async def _block_data(client: AsyncClient, headers: dict) -> dict:
    for _ in range(3):
        r = await client.post("/api/v1/risks", json=_RISK, headers=headers)
        assert r.status_code == 200
    r = await client.post("/api/v1/reports/preview", json={"blocks": _ALL_BLOCKS}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["data"]


@pytest.mark.asyncio
@pytest.mark.parametrize("fmt", ["pdf", "pptx"])
async def test_export_uses_workspace_colors_and_renders_every_block(
    client: AsyncClient, owner_headers: dict, fmt: str, caplog: pytest.LogCaptureFixture,
) -> None:
    data = await _block_data(client, owner_headers)
    r = await client.patch(
        "/api/v1/settings",
        json={"primary_color": "#2E86C1", "accent_color": "#C0392B"},
        headers=owner_headers,
    )
    assert r.status_code == 200
    caplog.set_level(logging.ERROR)
    r = await client.post(
        "/api/v1/reports/export",
        json={"blocks": _ALL_BLOCKS, "block_data": data, "format": fmt},
        headers=owner_headers,
    )
    await client.patch(
        "/api/v1/settings",
        json={"primary_color": "#01b88e", "accent_color": "#1F2854"},
        headers=owner_headers,
    )
    assert r.status_code == 200, r.text
    assert not [m for m in caplog.messages if "render error" in m], caplog.messages
    raw = base64.b64decode(r.json()["data"]["file_base64"])
    if fmt == "pdf":
        text = _pdf_text(raw)
        assert _rl("#C0392B") in text          # header bars and table heads
        assert _rl(DEFAULT_ACCENT) not in text  # no SmartRisk navy left
    else:
        prs = Presentation(io.BytesIO(raw))
        cover = prs.slides[0]
        assert str(cover.background.fill.fore_color.rgb) == "C0392B"


def test_palette_does_not_leak_between_builds() -> None:
    custom = resolve_palette({"primary_color": "#2E86C1", "accent_color": "#C0392B"})
    pdf_report.build_pdf([], {}, {}, {}, palette=custom)
    assert pdf_report._PALETTE.get() is DEFAULT_PALETTE
    assert pdf_report._S["block_title"].textColor.hexval() == "0x1f2854"
    pptx_report.build_pptx([], {}, {}, {}, palette=custom)
    assert pptx_report._PALETTE.get() is DEFAULT_PALETTE


def test_parallel_exports_keep_their_own_colors() -> None:
    reds = resolve_palette({"accent_color": "#C0392B"})
    blues = resolve_palette({"accent_color": "#1A5276"})

    def build(p) -> str:
        return _pdf_text(pdf_report.build_pdf([], {}, {}, {}, palette=p))

    with ThreadPoolExecutor(max_workers=4) as pool:
        outs = list(pool.map(build, [reds, blues, reds, blues]))
    for out, pal in zip(outs, [reds, blues, reds, blues]):
        other = blues if pal is reds else reds
        assert _rl(pal.accent) in out
        assert _rl(other.accent) not in out
