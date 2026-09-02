# app/services/pdf_report.py
"""
ReportLab PDF generation for the Report Builder.
Translates Reportservice.gs api_buildAndExportPDF() and
buildBlockHtml_() into ReportLab Platypus flowables.

Brand: Navy #1F2854, Teal #01b88e. No gradients. Solid colors only.
Source: Reportservice.gs lines 1617-2450.
"""

from __future__ import annotations

import io
import logging
from datetime import date
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    HRFlowable,
    Image,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

logger = logging.getLogger(__name__)

# ── Brand colors ───────────────────────────────────────────────────────────────
NAVY  = colors.HexColor("#1F2854")
TEAL  = colors.HexColor("#01b88e")
RED   = colors.HexColor("#ef4444")
AMBER = colors.HexColor("#f59e0b")
GREEN = colors.HexColor("#10b981")
MUTED = colors.HexColor("#64748b")
LIGHT = colors.HexColor("#f8fafc")
BORDER = colors.HexColor("#e2e8f0")
WHITE = colors.white
BLACK = colors.HexColor("#0f172a")

# ── Styles ─────────────────────────────────────────────────────────────────────
_base = getSampleStyleSheet()

_S = {
    "block_title": ParagraphStyle(
        "block_title", fontName="Helvetica-Bold", fontSize=11,
        textColor=NAVY, spaceAfter=4, spaceBefore=12,
    ),
    "narrative": ParagraphStyle(
        "narrative", fontName="Helvetica", fontSize=9,
        textColor=MUTED, leading=13, spaceAfter=4,
    ),
    "body": ParagraphStyle(
        "body", fontName="Helvetica", fontSize=9,
        textColor=colors.HexColor("#333333"), leading=13,
    ),
    "kpi_value": ParagraphStyle(
        "kpi_value", fontName="Helvetica-Bold", fontSize=20,
        textColor=NAVY, alignment=TA_CENTER,
    ),
    "kpi_label": ParagraphStyle(
        "kpi_label", fontName="Helvetica", fontSize=8,
        textColor=MUTED, alignment=TA_CENTER,
    ),
    "section_head": ParagraphStyle(
        "section_head", fontName="Helvetica-Bold", fontSize=8,
        textColor=MUTED, spaceAfter=3, spaceBefore=6,
    ),
    "cover_title": ParagraphStyle(
        "cover_title", fontName="Helvetica-Bold", fontSize=22,
        textColor=NAVY, leading=28, spaceAfter=8,
    ),
    "cover_sub": ParagraphStyle(
        "cover_sub", fontName="Helvetica", fontSize=11,
        textColor=MUTED, spaceAfter=6,
    ),
    "cover_meta_key": ParagraphStyle(
        "cover_meta_key", fontName="Helvetica-Bold", fontSize=7,
        textColor=MUTED, spaceAfter=2,
    ),
    "cover_meta_val": ParagraphStyle(
        "cover_meta_val", fontName="Helvetica", fontSize=10,
        textColor=NAVY, spaceAfter=0,
    ),
    "ai_text": ParagraphStyle(
        "ai_text", fontName="Helvetica", fontSize=9,
        textColor=colors.HexColor("#333333"), leading=16, spaceAfter=0,
    ),
    "footer": ParagraphStyle(
        "footer", fontName="Helvetica", fontSize=8,
        textColor=MUTED, alignment=TA_CENTER,
    ),
    "signoff_label": ParagraphStyle(
        "signoff_label", fontName="Helvetica-Bold", fontSize=9,
        textColor=NAVY,
    ),
    "signoff_val": ParagraphStyle(
        "signoff_val", fontName="Helvetica", fontSize=9,
        textColor=BLACK,
    ),
}


# ── Page X of N canvas ────────────────────────────────────────────────────────
from reportlab.pdfgen.canvas import Canvas as _RLCanvas


def _make_canvas_cls(
    page_size: tuple,
    org_name: str,
    footer_text: str,
    show_page_numbers: bool,
    has_cover: bool = False,
) -> type:
    """Returns a Canvas subclass that draws 'Page X of N' after two-pass render."""
    _margin = 20 * mm

    class _NC(_RLCanvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._page_states: list[dict] = []

        def showPage(self):  # type: ignore[override]
            self._page_states.append(dict(self.__dict__))
            self._startPage()

        def save(self):  # type: ignore[override]
            total = len(self._page_states)
            for state in self._page_states:
                self.__dict__.update(state)
                self._draw_footer(total)
                super().showPage()
            super().save()

        def _draw_footer(self, total: int) -> None:
            if has_cover and self._pageNumber == 1:  # type: ignore[attr-defined]
                return
            self.saveState()
            self.setFillColor(MUTED)
            self.setFont("Helvetica", 7)
            parts: list[str] = []
            if show_page_numbers:
                parts.append(f"Page {self._pageNumber} of {total}")  # type: ignore[attr-defined]
            parts.append(org_name)
            if footer_text:
                parts.append(footer_text)
            self.drawCentredString(
                page_size[0] / 2, 8 * mm, "  |  ".join(parts)
            )
            self.restoreState()

    return _NC


# ── Level color helper ─────────────────────────────────────────────────────────
def _level_color(level: str, level_index: int | None = None) -> colors.HexColor:
    if level_index is not None:
        idx = min(level_index - 1, len(_BAND_COLORS_BY_POS) - 1)
        return colors.HexColor(_BAND_COLORS_BY_POS[idx])
    l = (level or "").lower()
    if l in ("very high", "critical"):
        return colors.HexColor("#dc2626")
    if l == "high":
        return RED
    if l == "medium":
        return AMBER
    return GREEN


# ── Block title divider ────────────────────────────────────────────────────────
def _block_header(label: str) -> list:
    return [
        Paragraph(label, _S["block_title"]),
        HRFlowable(width="100%", thickness=1, color=NAVY, spaceAfter=6),
    ]


# ── KPI grid helper ────────────────────────────────────────────────────────────
def _kpi_val_paragraph(k: dict) -> Paragraph:
    """
    Renders KPI value with unit in smaller muted font.
    '71' (14pt teal) + '/100' (7pt muted) — prevents overflow on narrow cells.
    """
    val_str  = str(k.get("value", ""))
    unit_str = str(k.get("unit", "") or "")
    clr_str  = k.get("color", "#1F2854") if isinstance(k.get("color"), str) else "#1F2854"

    direction = k.get("direction")
    arrow = ""
    if direction == "up":
        arrow = '<font color="#ef4444" size="9"> &#9650;</font>'
    elif direction == "down":
        arrow = '<font color="#10b981" size="9"> &#9660;</font>'

    if unit_str:
        markup = (
            f'<font name="Helvetica-Bold" size="15" color="{clr_str}">{val_str}</font>'
            f'<font name="Helvetica" size="9" color="#94a3b8">{unit_str}</font>'
            + arrow
        )
        return Paragraph(markup, ParagraphStyle(
            "kvp", alignment=TA_LEFT, leading=18, spaceBefore=0, spaceAfter=0,
        ))
    markup = f'<font name="Helvetica-Bold" size="15" color="{clr_str}">{val_str}</font>' + arrow
    return Paragraph(markup, ParagraphStyle(
        "kv", alignment=TA_LEFT, leading=18, spaceBefore=0, spaceAfter=0,
    ))


def _kpi_table(kpis: list[dict], col_width: float = 50 * mm) -> Table:
    """One continuous KPI strip matching GAS visual treatment.

    Flat table structure (no nested tables per KPI) eliminates double-padding
    overhead and inter-cell gaps. LINEBEFORE applied to the first column only —
    matches GAS where the strip has a single left-edge accent, not a colored
    divider before every metric.
    """
    if not kpis:
        return Table([[Paragraph("", _S["body"])]], colWidths=[col_width])

    n = len(kpis)
    has_prev = any(k.get("prev") is not None for k in kpis)

    _lbl_s = ParagraphStyle(
        "kl", fontName="Helvetica", fontSize=8,
        textColor=colors.HexColor("#555555"), alignment=TA_LEFT,
    )
    _prv_s = ParagraphStyle(
        "kprev", fontName="Helvetica", fontSize=7,
        textColor=colors.HexColor("#94a3b8"), alignment=TA_LEFT,
    )

    val_row   = [_kpi_val_paragraph(k) for k in kpis]
    label_row = [Paragraph(k.get("label", ""), _lbl_s) for k in kpis]

    rows: list = [val_row, label_row]
    if has_prev:
        prev_row = [
            Paragraph(f"prev: {k['prev']}", _prv_s) if k.get("prev") is not None
            else Paragraph("", _prv_s)
            for k in kpis
        ]
        rows.append(prev_row)

    n_rows = len(rows)
    tbl = Table(rows, colWidths=[col_width] * n)

    first_color = (
        colors.HexColor(kpis[0]["color"])
        if isinstance(kpis[0].get("color"), str)
        else NAVY
    )

    style_cmds: list = [
        ("BACKGROUND",    (0, 0), (-1, -1),           colors.HexColor("#fbfbfb")),
        ("ALIGN",         (0, 0), (-1, -1),            "LEFT"),
        ("VALIGN",        (0, 0), (-1, -1),            "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1),            8),
        ("RIGHTPADDING",  (0, 0), (-1, -1),            4),
        # Default compact padding for all cells
        ("TOPPADDING",    (0, 0), (-1, -1),            2),
        ("BOTTOMPADDING", (0, 0), (-1, -1),            2),
        # Value row (row 0): generous top so strip has breathing room above value
        ("TOPPADDING",    (0, 0), (-1, 0),             7),
        # Last row: generous bottom closes the strip
        ("BOTTOMPADDING", (0, n_rows - 1), (-1, n_rows - 1), 6),
        # Single left accent — first column only, no inter-cell colored borders
        ("LINEBEFORE",    (0, 0), (0, -1),             3, first_color),
    ]

    tbl.setStyle(TableStyle(style_cmds))
    return tbl


# ── Narrative paragraph ────────────────────────────────────────────────────────
def _narrative(text: str | None) -> list:
    if not text:
        return []
    return [Spacer(1, 3 * mm), Paragraph(text, _S["narrative"])]


# ── AI callout box ─────────────────────────────────────────────────────────────
_CALLOUT_LABEL_COLORS: dict[str, str] = {
    "RISK":           "#dc2626",
    "OBSERVATION":    "#64748b",
    "OPPORTUNITY":    "#059669",
    "RECOMMENDATION": "#01b88e",
}


def _ai_callout(text: str) -> Table:
    """Renders an AI callout box. [LABEL] prefixes become colored bold inline spans."""
    import re
    # Split on label tokens; keep the label as a separate segment
    parts = re.split(r"(\[(?:RISK|OBSERVATION|OPPORTUNITY|RECOMMENDATION)\])", text.strip())
    paras: list[Paragraph] = []
    i = 0
    while i < len(parts):
        seg = parts[i].strip()
        if not seg:
            i += 1
            continue
        m = re.fullmatch(r"\[(\w+)\]", seg)
        if m:
            label  = m.group(1)
            color  = _CALLOUT_LABEL_COLORS.get(label, "#334155")
            body   = parts[i + 1].lstrip("\n").strip() if i + 1 < len(parts) else ""
            i += 2
            html_text = (
                f'<font color="{color}"><b>{label}:</b></font>'
                f'&nbsp;{body.replace("&", "&amp;").replace("<", "&lt;")}'
            )
            paras.append(Paragraph(html_text, _S["ai_text"]))
        else:
            paras.append(Paragraph(seg, _S["ai_text"]))
            i += 1

    if not paras:
        paras = [Paragraph(text, _S["ai_text"])]

    inner_data = [[p] for p in paras]
    inner = Table(inner_data, colWidths=["100%"])
    inner.setStyle(TableStyle([
        ("TOPPADDING",   (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 2),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    tbl = Table([[inner]], colWidths=["100%"])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), colors.HexColor("#f8faff")),
        ("LEFTPADDING",  (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING",   (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 12),
        ("LINEBEFORE",   (0, 0), (0, -1), 3, TEAL),
    ]))
    return tbl


# ═══════════════════════════════════════════════════════════════════════════════
# BLOCK RENDERERS
# ═══════════════════════════════════════════════════════════════════════════════

def _render_exposure_index(data: dict, ai_text: str | None) -> list:
    """
    Centered layout: large health number + badge | divider | secondary exposure index.
    Source: GAS buildBlockHtml_ exposure-index case + View_ReportBuilder renderBlockData_.
    """
    h     = data.get("health", 100 - data.get("score", 0))
    hl    = data.get("health_label", "Healthy")
    hc    = colors.HexColor(data.get("health_color", "#10b981"))
    score = data.get("score", 0)
    label = data.get("label", "")

    out = _block_header("Risk Health")

    _lbl_s = ParagraphStyle(
        "eil", fontName="Helvetica-Bold", fontSize=8,
        textColor=MUTED, alignment=TA_CENTER, spaceAfter=3, spaceBefore=3,
    )

    # ── Left: Risk Health (prominent) ─────────────────────────────────────────
    badge = Table(
        [[Paragraph(hl, ParagraphStyle(
            "eibg", fontName="Helvetica-Bold", fontSize=9,
            textColor=hc, alignment=TA_CENTER,
        ))]],
        colWidths=[60 * mm],
        style=TableStyle([
            ("BACKGROUND",   (0, 0), (-1, -1), colors.Color(hc.red, hc.green, hc.blue, alpha=0.13)),
            ("LEFTPADDING",  (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING",   (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 2),
        ]),
    )
    left_tbl = Table(
        [
            [Paragraph("RISK HEALTH", _lbl_s)],
            [Paragraph(str(h), ParagraphStyle(
                "eih", fontName="Helvetica-Bold", fontSize=35,
                textColor=hc, alignment=TA_CENTER, leading=40,
            ))],
            [badge],
            [Paragraph("/ 100 \u2014 higher is better", ParagraphStyle(
                "eihs", fontName="Helvetica", fontSize=8,
                textColor=colors.HexColor("#94a3b8"), alignment=TA_CENTER, spaceBefore=3,
            ))],
        ],
        colWidths=[83 * mm],
        style=TableStyle([
            ("ALIGN",        (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING",   (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 2),
            ("LEFTPADDING",  (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]),
    )

    # ── Right: Exposure Index (secondary) ─────────────────────────────────────
    right_tbl = Table(
        [
            [Paragraph("EXPOSURE INDEX", _lbl_s)],
            [Paragraph(str(score), ParagraphStyle(
                "eii", fontName="Helvetica-Bold", fontSize=23,
                textColor=NAVY, alignment=TA_CENTER, leading=27, spaceAfter=4,
            ))],
            [Paragraph(f"/ 100 \u2014 <b>{label}</b>", ParagraphStyle(
                "eiil", fontName="Helvetica", fontSize=9,
                textColor=colors.HexColor("#94a3b8"), alignment=TA_CENTER,
            ))],
        ],
        colWidths=[77 * mm],
        style=TableStyle([
            ("ALIGN",        (0, 0), (-1, -1), "CENTER"),
            ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",   (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 2),
            ("LEFTPADDING",  (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]),
    )

    # ── Two-column layout with vertical divider after left column ─────────────
    layout = Table(
        [[left_tbl, right_tbl]],
        colWidths=[83 * mm, 77 * mm],
    )
    layout.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",        (0, 0), (-1, -1), "CENTER"),
        ("LINEAFTER",    (0, 0), (0, -1),   0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING",   (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    out.append(layout)
    out.extend(_narrative(ai_text or data.get("narrative")))
    return out


def _render_risk_snapshot(data: dict, ai_text: str | None) -> list:
    kpis = [
        {"label": "Total Risks",     "value": data.get("total", 0),        "color": "#1F2854"},
        {"label": "High / Critical", "value": data.get("high_count", 0),   "color": "#ef4444"},
        {"label": "Avg Residual",    "value": data.get("avg_residual", 0),  "color": "#f59e0b"},
    ]
    out = _block_header("Risk Snapshot")
    out.append(_kpi_table(kpis, col_width=55 * mm))
    out.extend(_narrative(ai_text or data.get("narrative")))
    return out


def _render_key_risk_changes(data: dict, ai_text: str | None) -> list:
    kpis = [
        {"label": "Risks Increased", "value": f"+{data.get('increased', 0)}", "color": "#1F2854"},
        {"label": "Risks Decreased", "value": f"\u2212{data.get('decreased', 0)}", "color": "#1F2854"},
        {"label": "New High Risks",  "value": data.get("new_high_risks", 0),  "color": "#ef4444"},
    ]
    out = _block_header("Key Risk Changes")
    out.append(_kpi_table(kpis, col_width=55 * mm))
    out.extend(_narrative(ai_text or data.get("narrative")))
    return out


def _render_incident_stability(data: dict, ai_text: str | None) -> list:
    mttr = data.get("mttr_days") or "—"
    kpis = [
        {"label": "Total",       "value": data.get("total", 0),  "color": "#1F2854"},
        {"label": "Open",        "value": data.get("open", 0),   "color": "#ef4444"},
        {"label": "Closed",      "value": data.get("closed", 0), "color": "#10b981"},
        {"label": "MTTR (days)", "value": mttr,                  "color": "#f59e0b"},
    ]
    out = _block_header("Incident Stability")
    out.append(_kpi_table(kpis, col_width=42 * mm))
    out.extend(_narrative(data.get("narrative")))
    return out


def _render_ai_exec_summary(data: dict, ai_text: str | None) -> list:
    out = _block_header("Executive Summary")
    if ai_text:
        out.append(_ai_callout(ai_text))
    else:
        for p in (data.get("paragraphs") or []):
            out.append(Paragraph(p, _S["body"]))
            out.append(Spacer(1, 3 * mm))
    return out


_COMMENTARY_SECTIONS = [
    ("Observation",       NAVY,  "\u25cf"),   # ● matches GAS &#9679;
    ("Impact",            RED,   "\u25b3"),   # △ matches GAS &#9651;
    ("Recommended Focus", TEAL,  "\u2713"),   # ✓ matches GAS &#10003;
]


def _parse_commentary(text: str) -> list[tuple[str, colors.HexColor, str, str]]:
    """Parses 'Observation: ... Impact: ... Recommended Focus: ...' into sections.
    Returns list of (section_key, color, icon, body). Returns empty list if not structured."""
    import re
    out: list[tuple[str, colors.HexColor, str, str]] = []
    for i, (key, color, icon) in enumerate(_COMMENTARY_SECTIONS):
        pattern = re.compile(rf"{re.escape(key)}\s*:\s*", re.IGNORECASE)
        m = pattern.search(text)
        if not m:
            continue
        start = m.end()
        if i + 1 < len(_COMMENTARY_SECTIONS):
            next_key = _COMMENTARY_SECTIONS[i + 1][0]
            end_pat  = re.compile(rf"\n\s*{re.escape(next_key)}\s*:", re.IGNORECASE)
            end_m    = end_pat.search(text, start)
            body     = text[start: end_m.start()].strip() if end_m else text[start:].strip()
        else:
            body = text[start:].strip()
        if body:
            out.append((key, color, icon, body))
    return out


def _render_executive_commentary(data: dict, ai_text: str | None) -> list:
    out  = _block_header("Executive Commentary")
    text = ai_text or data.get("text") or ""
    if not text:
        out.append(Paragraph(
            "No commentary entered.",
            ParagraphStyle(
                "ec_empty", fontName="Helvetica-Oblique", fontSize=9,
                textColor=colors.HexColor("#94a3b8"), leading=13,
            ),
        ))
        return out

    sections = _parse_commentary(text)
    if not sections:
        # Unstructured — fall back to plain callout
        out.append(_ai_callout(text))
        return out

    for key, color, icon, body in sections:
        label_para = Paragraph(
            f'<font color="{color.hexval()}">'
            f'<b>{icon} {key.upper()}</b>'
            f'</font>',
            ParagraphStyle(
                "ec_lbl", fontName="Helvetica-Bold", fontSize=8,
                textColor=color, spaceAfter=3,
                letterSpacing=0.6,
            ),
        )
        body_para = Paragraph(body, ParagraphStyle(
            "ec_body", fontName="Helvetica", fontSize=9,
            textColor=colors.HexColor("#334155"), leading=16,
        ))
        section_tbl = Table(
            [[label_para], [body_para]],
            colWidths=["100%"],
        )
        section_tbl.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, -1), colors.HexColor("#f8faff")),
            ("LINEBEFORE",   (0, 0), (0, -1),  3, color),
            ("LEFTPADDING",  (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING",   (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 8),
        ]))
        out.append(section_tbl)
        out.append(Spacer(1, 3 * mm))

    return out


def _render_trend_chart(label: str, points: list[dict], value_key: str,
                        bar_color: colors.HexColor, narrative: str | None) -> list:
    """Generic SVG-free bar chart using ReportLab rectangles via Drawing."""
    from reportlab.graphics.shapes import Drawing, Rect, String
    from reportlab.graphics import renderPDF

    out = _block_header(label)
    if not points:
        out.extend(_narrative(narrative))
        return out

    W, H, PAD = 160 * mm, 35 * mm, 4 * mm
    vals   = [float(p.get(value_key) or 0) for p in points]
    maxv   = max(vals) or 1
    n      = len(points)
    gap    = 2 * mm
    bar_w  = (W - PAD * 2 - gap * (n - 1)) / max(n, 1)
    chart_h = H - 10 * mm  # reserve bottom for labels

    d = Drawing(W, H)
    for i, (pt, val) in enumerate(zip(points, vals)):
        bh = max(1, (val / maxv) * chart_h)
        x  = PAD + i * (bar_w + gap)
        y  = 8 * mm
        rect = Rect(x, y, bar_w, bh, fillColor=bar_color, strokeColor=None)
        d.add(rect)
        # label below bar
        d.add(String(x + bar_w / 2, 1 * mm, str(pt.get("label", "")),
                     fontSize=6, textAnchor="middle", fillColor=MUTED.hexval()))
        # value above bar
        if val:
            d.add(String(x + bar_w / 2, y + bh + 1 * mm, str(int(val)),
                         fontSize=6, textAnchor="middle", fillColor=MUTED.hexval()))

    out.append(d)
    out.extend(_narrative(narrative))
    return out


def _render_line_chart(
    label: str, points: list[dict], value_key: str,
    line_color: colors.HexColor, narrative: str | None,
) -> list:
    """
    Line chart with area fill, dots, and value labels.
    Translates GAS svgLine_() from View_ReportBuilder.html.
    """
    from reportlab.graphics.shapes import Drawing, PolyLine, Circle, String as GStr, Polygon

    out = _block_header(label)
    if not points:
        out.extend(_narrative(narrative))
        return out

    W, H, PAD = 160 * mm, 38 * mm, 6 * mm
    vals   = [float(p.get(value_key) or 0) for p in points]
    maxv   = max(vals) or 1
    n      = len(points)
    bottom = 8 * mm  # baseline y
    chart_h = H - bottom - 6 * mm  # usable height

    if n == 1:
        xs = [W / 2]
    else:
        step = (W - PAD * 2) / (n - 1)
        xs   = [PAD + i * step for i in range(n)]

    def _vy(v: float) -> float:
        return bottom + max(2, (v / maxv) * chart_h)

    ys = [_vy(v) for v in vals]

    d = Drawing(W, H)

    # Area fill (10% opacity equivalent — use LIGHT tint)
    if n > 1:
        area_pts: list[float] = [xs[0], bottom]
        for x, y in zip(xs, ys):
            area_pts += [x, y]
        area_pts += [xs[-1], bottom]
        area_color = colors.Color(
            line_color.red, line_color.green, line_color.blue, alpha=0.12
        )
        d.add(Polygon(area_pts, fillColor=area_color, strokeColor=None))

        # Line
        line_pts: list[float] = []
        for x, y in zip(xs, ys):
            line_pts += [x, y]
        d.add(PolyLine(line_pts, strokeColor=line_color, strokeWidth=1.5,
                       strokeLineJoin=1, strokeLineCap=1))

    # Dots + value labels + x-axis labels
    for pt, v, x, y in zip(points, vals, xs, ys):
        d.add(Circle(x, y, 2.5, fillColor=line_color, strokeColor=None))
        if v:
            v_str = str(int(v)) if float(v) == int(float(v)) else f"{v:.1f}"
            d.add(GStr(x, y + 2 * mm, v_str,
                        fontSize=6, textAnchor="middle",
                        fillColor=MUTED.hexval()))
        d.add(GStr(x, 1 * mm, str(pt.get("label", "")),
                    fontSize=6, textAnchor="middle",
                    fillColor=MUTED.hexval()))

    out.append(d)
    out.extend(_narrative(narrative))
    return out


def _render_exposure_trend(data: dict, ai_text: str | None) -> list:
    return _render_trend_chart(
        "Exposure Trend", data.get("points", []),
        "score", TEAL, ai_text or data.get("narrative")
    )


def _render_residual_risk_trend(data: dict, ai_text: str | None) -> list:
    return _render_line_chart(
        "Residual Risk Trend", data.get("points", []),
        "avg", NAVY, ai_text or data.get("narrative")
    )


def _render_incident_trend(data: dict, ai_text: str | None) -> list:
    return _render_trend_chart(
        "Incident Trend", data.get("points", []),
        "count", AMBER, ai_text or data.get("narrative")
    )


# Position-based band colors: index 0 = lowest band, 4 = highest.
# Label-agnostic — works with any matrix configuration.
_BAND_COLORS_BY_POS: list[str] = [
    "#10b981",  # band 1 — low
    "#f59e0b",  # band 2 — medium
    "#ef4444",  # band 3 — high
    "#dc2626",  # band 4 — very high / critical
    "#b91c1c",  # band 5 — extreme
]
_BAND_BG_COLORS_BY_POS: list[str] = [
    "#ecfdf5",  # band 1 — low
    "#fffbeb",  # band 2 — medium
    "#fef2f2",  # band 3 — high
    "#fee2e2",  # band 4 — very high / critical
    "#ffd6d6",  # band 5 — extreme
]


def _make_donut_drawing(by_level: dict, order: list[str]) -> Any:
    """
    Donut chart Drawing for Risk Distribution.
    Translates GAS svgDonut_() from View_ReportBuilder.html.
    Colors assigned by band position, not label name — matrix-agnostic.
    """
    from reportlab.graphics.shapes import (
        Drawing, Wedge, Circle,
        Rect as GRect, String as GStr,
    )

    slices: list[tuple[str, int, str]] = []
    for i, k in enumerate(order):
        v = int(by_level.get(k, 0) or 0)
        if v > 0:
            clr_hex = _BAND_COLORS_BY_POS[min(i, len(_BAND_COLORS_BY_POS) - 1)]
            slices.append((k, v, clr_hex))

    total = sum(v for _, v, _ in slices) or 1

    DW, DH = 78 * mm, 55 * mm
    CX   = 25 * mm
    CY   = 27 * mm
    R    = 20 * mm
    r_in = 11 * mm

    d = Drawing(DW, DH)

    angle = 90.0          # start at 12 o'clock
    for k, v, clr_hex in slices:
        clr   = colors.HexColor(clr_hex)
        sweep = (v / total) * 360.0
        if len(slices) == 1:
            d.add(Wedge(CX, CY, R, 90, 270,
                         fillColor=clr, strokeColor=WHITE, strokeWidth=0.5))
            d.add(Wedge(CX, CY, R, 270, 90,
                         fillColor=clr, strokeColor=WHITE, strokeWidth=0.5))
            break
        d.add(Wedge(CX, CY, R, angle, angle + sweep,
                     fillColor=clr, strokeColor=WHITE, strokeWidth=0.5))
        angle += sweep

    # Donut hole
    d.add(Circle(CX, CY, r_in, fillColor=WHITE, strokeColor=None))

    # Center: total count + "Total" label
    d.add(GStr(CX, CY + 2, str(total),
                textAnchor='middle', fontSize=9, fontName='Helvetica-Bold',
                fillColor=colors.HexColor('#0f172a').hexval()))
    d.add(GStr(CX, CY - 8, 'Total',
                textAnchor='middle', fontSize=7, fontName='Helvetica',
                fillColor=MUTED.hexval()))

    # Inline legend (right of donut, within the Drawing)
    lx    = 50 * mm
    row_h = 13
    for i, (k, v, clr_hex) in enumerate(slices):
        clr = colors.HexColor(clr_hex)
        pct = round((v / total) * 100)
        y   = DH - (i + 1) * row_h - 4
        d.add(GRect(lx, y, 7, 7, fillColor=clr, strokeColor=None))
        d.add(GStr(lx + 10, y + 5,
                    f'{k}: {v} ({pct}%)',
                    textAnchor='start', fontSize=8, fontName='Helvetica',
                    fillColor=colors.HexColor('#334155').hexval()))

    return d


def _render_risk_distribution(data: dict, ai_text: str | None) -> list:
    out = _block_header("Risk Distribution")

    by_level    = data.get("by_level", {})
    by_category = data.get("by_category", {})
    ORDER = data.get("band_labels") or ["Low", "Medium", "High", "Critical"]

    # ── Left: donut chart ─────────────────────────────────────────────────────
    donut = _make_donut_drawing(by_level, ORDER)

    # ── Right: BY CATEGORY table ──────────────────────────────────────────────
    cat_rows = [["BY CATEGORY", "Count"]] + [
        [Paragraph(k, _S["body"]), Paragraph(str(v), _S["body"])]
        for k, v in sorted(by_category.items(), key=lambda x: x[1], reverse=True)[:8]
    ]
    cat_ts = TableStyle([
        ("BACKGROUND",     (0, 0), (-1, 0), colors.HexColor("#f8fafc")),
        ("TEXTCOLOR",      (0, 0), (-1, 0), MUTED),
        ("FONTNAME",       (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",       (0, 0), (-1, 0), 7),
        ("FONTNAME",       (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",       (0, 1), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
        ("LINEBELOW",      (0, 0), (-1, 0), 0.5, BORDER),
        ("LINEBELOW",      (0, 1), (-1, -1), 0.25, BORDER),
        ("TOPPADDING",     (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",  (0, 0), (-1, -1), 4),
        ("LEFTPADDING",    (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",   (0, 0), (-1, -1), 6),
    ])
    cat_tbl = Table(cat_rows, colWidths=[65 * mm, 15 * mm], style=cat_ts)

    combined = Table(
        [[donut, cat_tbl]],
        colWidths=[94 * mm, 76 * mm],
    )
    combined.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    out.append(combined)
    out.extend(_narrative(ai_text or data.get("narrative")))
    return out


def _render_risk_table(label: str, risks: list[dict], intro: str | None,
                       ai_text: str | None) -> list:
    out = _block_header(label)
    if intro:
        out.append(Paragraph(intro, _S["narrative"]))
        out.append(Spacer(1, 2 * mm))

    _TREND_MARKUP = {
        "increasing": '<font color="#ef4444"><b>▲</b></font>',
        "volatile":   '<font color="#ef4444"><b>▲</b></font>',
        "improving":  '<font color="#10b981"><b>▼</b></font>',
    }
    _trend_s = ParagraphStyle(
        "trnd", fontName="Helvetica-Bold", fontSize=8,
        textColor=colors.HexColor("#94a3b8"), alignment=TA_CENTER,
    )
    _res_s = ParagraphStyle(
        "res", fontName="Helvetica", fontSize=8,
        textColor=colors.HexColor("#333333"), alignment=TA_CENTER,
    )

    headers = ["ID", "Dept / Risk Owner", "Description", "Level", "Residual", "Trend"]
    rows = [headers] + [
        [
            Paragraph(str(r.get("id", "")), _S["body"]),
            Paragraph((r.get("owner") or "")[:50], _S["body"]),
            Paragraph((r.get("desc") or "")[:100], _S["body"]),
            _level_badge_cell(r.get("level", ""), r.get("level_index")),
            Paragraph(str(r.get("residual", "")), _res_s),
            Paragraph(
                _TREND_MARKUP.get((r.get("movement") or "").lower(),
                                  '<font color="#94a3b8">→</font>'),
                _trend_s,
            ),
        ]
        for r in risks
    ]
    col_w = [22 * mm, 38 * mm, 50 * mm, 22 * mm, 16 * mm, 14 * mm]
    tbl = Table(rows, colWidths=col_w, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR",    (0, 0), (-1, 0), WHITE),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
        ("GRID",         (0, 0), (-1, -1), 0.25, BORDER),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("LEFTPADDING",  (0, 0), (-1, -1), 4),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
    ]))
    out.append(tbl)
    if ai_text:
        out.append(Spacer(1, 3 * mm))
        out.append(_ai_callout(ai_text))
    return out


def _render_top_risks(data: dict, ai_text: str | None) -> list:
    return _render_risk_table("Top Risks", data.get("risks", []), data.get("intro"), ai_text)


def _render_top_emerging_risks(data: dict, ai_text: str | None) -> list:
    return _render_risk_table("Top Emerging Risks", data.get("risks", []), data.get("intro"), ai_text)


def _render_major_incidents(data: dict, ai_text: str | None) -> list:
    out = _block_header("Major Incidents")
    if data.get("intro"):
        out.append(Paragraph(data["intro"], _S["narrative"]))
        out.append(Spacer(1, 2 * mm))

    incidents = data.get("incidents", [])
    rows = [["ID", "Description", "Severity", "Status"]] + [
        [
            Paragraph(str(i.get("id", "")), _S["body"]),
            Paragraph((i.get("desc") or "")[:100], _S["body"]),
            Paragraph(i.get("severity", ""), ParagraphStyle(
                "sv", fontName="Helvetica-Bold", fontSize=8,
                textColor=_level_color(i.get("severity", "")),
            )),
            Paragraph(i.get("status", ""), _S["body"]),
        ]
        for i in incidents
    ]
    tbl = Table(rows, colWidths=[22 * mm, 90 * mm, 24 * mm, 22 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR",    (0, 0), (-1, 0), WHITE),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
        ("GRID",         (0, 0), (-1, -1), 0.25, BORDER),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("LEFTPADDING",  (0, 0), (-1, -1), 4),
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
    ]))
    out.append(tbl)
    if ai_text:
        out.append(Spacer(1, 3 * mm))
        out.append(_ai_callout(ai_text))
    return out


def _render_findings(data: dict, _ai: str | None) -> list:
    out = _block_header("Findings")

    def _section(items: list[str], heading: str, dot_color: colors.HexColor) -> None:
        if not items:
            return
        out.append(Paragraph(heading, ParagraphStyle(
            "sh", fontName="Helvetica-Bold", fontSize=9,
            textColor=dot_color, spaceAfter=4, spaceBefore=8,
        )))
        for f in items:
            row = Table(
                [[Paragraph("●", ParagraphStyle("dot", fontName="Helvetica-Bold",
                                                 fontSize=8, textColor=dot_color)),
                  Paragraph(f, _S["body"])]],
                colWidths=[6 * mm, None],
            )
            row.setStyle(TableStyle([
                ("VALIGN",       (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING",  (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (0,  -1), 6),
                ("TOPPADDING",   (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
                ("LINEBELOW",    (0, 0), (-1, -1), 0.25, colors.HexColor("#f1f5f9")),
            ]))
            out.append(row)

    _section(data.get("positive_signals", []),    "Positive Signals",           GREEN)
    _section(data.get("key_risks", []),            "Key Risks",                  RED)
    _section(data.get("areas_for_attention", []), "Areas Requiring Attention",   AMBER)

    # Fallback to flat findings list
    if (not data.get("positive_signals") and not data.get("key_risks")
            and not data.get("areas_for_attention")):
        for f in (data.get("findings") or []):
            out.append(Paragraph(f"● {f}", _S["body"]))
    return out


def _parse_ai_recommendations(text: str) -> list[dict]:
    """
    Parses 'Action X: ...\nPriority: ...\nOwner: ...\nDue: ...\nExpected Outcome: ...\n[body]'
    into recommendation dicts. Returns empty list if structure not detected.
    Source: GAS renderRecommendationsHtml_()
    """
    import re
    parts = re.split(r'(?=\bAction\s+\d+\s*:)', text, flags=re.IGNORECASE)
    parts = [p.strip() for p in parts if p.strip()]
    if len(parts) <= 1:
        return []
    FIELD_RE = re.compile(r'^(Priority|Owner|Due|Expected\s+Outcome)\s*:\s*(.+)$', re.IGNORECASE)
    result: list[dict] = []
    for part in parts:
        lines = [ln.strip() for ln in part.split('\n') if ln.strip()]
        if not lines:
            continue
        title = re.sub(r'^Action\s+\d+\s*:\s*', '', lines[0], flags=re.IGNORECASE).strip()
        fields: dict[str, str] = {}
        body_lines: list[str] = []
        for ln in lines[1:]:
            m = FIELD_RE.match(ln)
            if m:
                key = re.sub(r'\s+', '_', m.group(1).strip().lower())
                fields[key] = m.group(2).strip()
            else:
                body_lines.append(ln)
        result.append({
            'title':    title,
            'priority': fields.get('priority', ''),
            'owner':    fields.get('owner', ''),
            'due':      fields.get('due', ''),
            'outcome':  fields.get('expected_outcome', ''),
            'body':     ' '.join(body_lines),
        })
    return result


def _render_recommendations(data: dict, ai_text: str | None) -> list:
    out = _block_header("Recommendations")
    if data.get("intro"):
        out.append(Paragraph(data["intro"], _S["narrative"]))
        out.append(Spacer(1, 2 * mm))

    if ai_text:
        parsed = _parse_ai_recommendations(ai_text)
        if not parsed:
            out.append(_ai_callout(ai_text))
            return out
        # Render AI-parsed cards using same card structure as data.recommendations
        for i, rec in enumerate(parsed, 1):
            _render_rec_card(out, i, rec)
        return out

    PRIORITY_COLORS = {
        "critical": colors.HexColor("#dc2626"),
        "high":     RED,
        "medium":   AMBER,
        "low":      GREEN,
    }

    for i, rec in enumerate(data.get("recommendations", []), 1):
        if isinstance(rec, str):
            row = Table(
                [[Paragraph(f"{i}.", ParagraphStyle(
                    "recnum", fontName="Helvetica-Bold", fontSize=9,
                    textColor=TEAL,
                 )),
                  Paragraph(rec, _S["body"])]],
                colWidths=[6 * mm, None],
            )
            row.setStyle(TableStyle([
                ("VALIGN",       (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING",  (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (0,  -1), 6),
                ("TOPPADDING",   (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
                ("LINEBELOW",    (0, 0), (-1, -1), 0.25, colors.HexColor("#f1f5f9")),
            ]))
            out.append(row)
        else:
            _render_rec_card(out, i, rec)

    return out


def _render_rec_card(out: list, index: int, rec: dict) -> None:
    """Renders one recommendation action card. Shared by AI and data paths.
    Source: GAS renderRecommendationsHtml_()"""
    _PRIORITY_COLORS: dict[str, colors.HexColor] = {
        "critical": colors.HexColor("#dc2626"),
        "high":     RED,
        "medium":   AMBER,
        "low":      GREEN,
    }

    title    = rec.get("title", "")
    priority = rec.get("priority", "")
    owner    = rec.get("owner", "")
    due      = rec.get("due", "")
    outcome  = rec.get("outcome", "")
    body     = rec.get("body", "")
    pc       = _PRIORITY_COLORS.get((priority or "").lower(), MUTED)

    # ── Title + priority badge inline ─────────────────────────────────────────
    pri_hex  = pc.hexval()
    title_markup = f"Action {index}: {title}"
    if priority:
        title_markup += (
            f'  <font color="{pri_hex}" size="8">'
            f'<b>[{priority.upper()}]</b></font>'
        )

    # ── Meta row: owner · due ─────────────────────────────────────────────────
    meta_parts: list[str] = []
    if owner: meta_parts.append(f"Owner: {owner}")
    if due:   meta_parts.append(f"Due: {due}")

    inner_rows: list[list] = [
        [Paragraph(title_markup, ParagraphStyle(
            "at", fontName="Helvetica-Bold", fontSize=9, textColor=TEAL,
        ))],
    ]
    if meta_parts:
        inner_rows.append([Paragraph(
            "  \u00b7  ".join(meta_parts),
            ParagraphStyle("am", fontName="Helvetica", fontSize=8,
                           textColor=MUTED, spaceAfter=3),
        )])
    if outcome:
        inner_rows.append([Paragraph(
            f"&#10003; {outcome}",
            ParagraphStyle("ao", fontName="Helvetica", fontSize=8,
                           textColor=GREEN),
        )])
    if body:
        inner_rows.append([Spacer(1, 2 * mm)])
        inner_rows.append([Paragraph(body, _S["body"])])

    card = Table([[
        Table(
            inner_rows,
            colWidths=["100%"],
            style=TableStyle([
                ("LEFTPADDING",  (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING",   (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING",(0, 0), (-1, -1), 2),
            ]),
        )
    ]], colWidths=["100%"])
    card.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), colors.HexColor("#f8faff")),
        ("LINEBEFORE",   (0, 0), (0, -1), 3, TEAL),
        ("LEFTPADDING",  (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING",   (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 8),
    ]))
    out.append(card)
    out.append(Spacer(1, 3 * mm))


def _render_conclusion(data: dict, ai_text: str | None) -> list:
    out  = _block_header("Conclusion")
    text = ai_text or data.get("text") or ""
    if text:
        out.append(Paragraph(text, ParagraphStyle(
            "conc", fontName="Helvetica", fontSize=9,
            textColor=colors.HexColor("#333333"), leading=14,
        )))
    return out


def _render_risk_ownership(data: dict, ai_text: str | None) -> list:
    out = _block_header("Risk Ownership")
    owners = data.get("top_owners", [])
    if not owners:
        return out

    rows = [["Dept/Risk Owner", "High Risks", "Total", "Avg Residual", "Top Category"]] + [
        [
            Paragraph(o.get("owner", ""), _S["body"]),
            Paragraph(str(o.get("high_count", 0)), ParagraphStyle(
                "hc", fontName="Helvetica-Bold", fontSize=8, textColor=RED)),
            Paragraph(str(o.get("total_count", 0)), _S["body"]),
            Paragraph(str(o.get("avg_residual", 0)), _S["body"]),
            Paragraph(o.get("top_category", ""), _S["body"]),
        ]
        for o in owners
    ]
    tbl = Table(rows, colWidths=[45 * mm, 22 * mm, 18 * mm, 26 * mm, 45 * mm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR",     (0, 0), (-1, 0), WHITE),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, LIGHT]),
        ("GRID",          (0, 0), (-1, -1), 0.25, BORDER),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        # GAS: High Risks, Total, Avg Residual are text-align:center
        ("ALIGN",         (1, 0), (3, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    out.append(tbl)
    conc = data.get("concentration", 0)
    if conc:
        out.append(Spacer(1, 2 * mm))
        out.append(Paragraph(
            f"Top 3 owners hold <b>{conc}%</b> of all high-risk items.", _S["narrative"]
        ))
    out.extend(_narrative(ai_text or data.get("narrative")))
    return out


def _render_incident_analytics(data: dict, ai_text: str | None) -> list:
    out = _block_header("Incident Analytics")
    if not data.get("total"):
        out.extend(_narrative(data.get("narrative")))
        return out

    mttr = data.get("mttr_days") or "—"
    kpis = [
        {"label": "Total",       "value": data.get("total", 0),  "color": "#1F2854"},
        {"label": "Open",        "value": data.get("open", 0),   "color": "#ef4444"},
        {"label": "Closed",      "value": data.get("closed", 0), "color": "#10b981"},
        {"label": "MTTR (days)", "value": mttr,                  "color": "#f59e0b"},
    ]
    out.append(_kpi_table(kpis, col_width=42 * mm))
    out.append(Spacer(1, 3 * mm))

    by_cat = sorted(data.get("by_category", {}).items(), key=lambda x: x[1], reverse=True)[:6]
    by_sev = sorted(data.get("by_severity", {}).items(), key=lambda x: x[1], reverse=True)

    ts = TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR",    (0, 0), (-1, 0), WHITE),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
        ("GRID",         (0, 0), (-1, -1), 0.25, BORDER),
        ("TOPPADDING",   (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
        ("LEFTPADDING",  (0, 0), (-1, -1), 4),
    ])
    cat_tbl = Table(
        [["Category", "Count"]] + [[k, v] for k, v in by_cat],
        colWidths=[65 * mm, 15 * mm], style=ts,
    )
    sev_tbl = Table(
        [["Severity", "Count"]] + [[k, v] for k, v in by_sev],
        colWidths=[45 * mm, 15 * mm], style=ts,
    )
    combined = Table(
        [[cat_tbl, sev_tbl]],
        colWidths=[85 * mm, 65 * mm],
    )
    combined.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    out.append(combined)
    out.extend(_narrative(ai_text or data.get("narrative")))
    return out


def _render_executive_dashboard(data: dict, ai_text: str | None) -> list:
    if data.get("no_data"):
        out = _block_header("Executive Dashboard")
        msg = (data.get("bullets") or ["No risk data for the selected date range."])[0]
        no_data_box = Table(
            [
                [Paragraph("No Data Available", ParagraphStyle(
                    "ndh", fontName="Helvetica-Bold", fontSize=10,
                    textColor=colors.HexColor("#94a3b8"), alignment=TA_CENTER, spaceAfter=4,
                ))],
                [Paragraph(msg, ParagraphStyle(
                    "ndb", fontName="Helvetica", fontSize=9,
                    textColor=colors.HexColor("#94a3b8"), alignment=TA_CENTER, leading=14,
                ))],
            ],
            colWidths=["100%"],
        )
        no_data_box.setStyle(TableStyle([
            ("BOX",          (0, 0), (-1, -1), 0.5, BORDER),
            ("LINEABOVE",    (0, 0), (-1, 0),  0,   BORDER),
            ("TOPPADDING",   (0, 0), (-1, -1), 14),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 14),
            ("LEFTPADDING",  (0, 0), (-1, -1), 16),
            ("RIGHTPADDING", (0, 0), (-1, -1), 16),
        ]))
        out.append(no_data_box)
        return out

    out = _block_header("Executive Dashboard")
    kpis = data.get("kpis", [])
    if kpis:
        col_w   = (180 * mm) / max(len(kpis), 1)
        kpi_tbl = _kpi_table(kpis, col_width=col_w)
        out.append(kpi_tbl)
        out.append(Spacer(1, 2 * mm))

    posture = data.get("posture", {})
    if posture:
        p_color = (
            GREEN if posture.get("trend") == "Improving" else
            RED   if posture.get("trend") == "Worsening" else
            AMBER
        )
        _col_w3 = (180 * mm) / 3
        _plbl = ParagraphStyle(
            "plbl", fontName="Helvetica-Bold", fontSize=8,
            textColor=MUTED, alignment=TA_CENTER, spaceAfter=3,
        )
        _pval = ParagraphStyle(
            "pval", fontName="Helvetica-Bold", fontSize=10,
            textColor=NAVY, alignment=TA_CENTER,
        )
        posture_row = Table(
            [
                [
                    Paragraph("STATUS",     _plbl),
                    Paragraph("TREND",      _plbl),
                    Paragraph("CONFIDENCE", _plbl),
                ],
                [
                    Paragraph(posture.get("status", ""), _pval),
                    Paragraph(posture.get("trend", ""), ParagraphStyle(
                        "ptrend", fontName="Helvetica-Bold", fontSize=10,
                        textColor=p_color, alignment=TA_CENTER,
                    )),
                    Paragraph(posture.get("confidence", ""), _pval),
                ],
            ],
            colWidths=[_col_w3, _col_w3, _col_w3],
        )
        posture_row.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, -1), colors.HexColor("#f8faff")),
            ("ALIGN",        (0, 0), (-1, -1), "CENTER"),
            ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",   (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
            ("LEFTPADDING",  (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]))
        out.append(posture_row)
        out.append(Spacer(1, 2 * mm))

    heading = (data.get("heading_text") or "What Leadership Needs To Know").upper()
    out.append(Paragraph(heading, ParagraphStyle(
        "edhead", fontName="Helvetica-Bold", fontSize=8,
        textColor=NAVY, spaceAfter=6, spaceBefore=4,
    )))

    bullets_src = []
    if ai_text:
        bullets_src = [b.strip() for b in ai_text.split("\n") if b.strip()]
    else:
        bullets_src = data.get("bullets") or []

    _btxt = ParagraphStyle(
        "edbul", fontName="Helvetica", fontSize=9,
        textColor=colors.HexColor("#334155"), leading=12,
    )
    for b in bullets_src:
        row = Table(
            [[Paragraph("●", ParagraphStyle("dot2", fontName="Helvetica-Bold",
                                             fontSize=9, textColor=TEAL)),
              Paragraph(b, _btxt)]],
            colWidths=[6 * mm, None],
        )
        row.setStyle(TableStyle([
            ("VALIGN",       (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",   (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (0,  -1), 6),
            ("LINEBELOW",    (0, 0), (-1, -1), 0.25, colors.HexColor("#f1f5f9")),
        ]))
        out.append(row)

    return out


def _level_badge_cell(level: str, level_index: int | None = None) -> Table:
    """Pill badge matching GAS levelBadge_gs_() — used in risk tables and key risk movements.
    When level_index is supplied, colors are assigned by band position (label-agnostic).
    Falls back to string matching when level_index is not available."""
    if level_index is not None:
        idx = min(level_index - 1, len(_BAND_COLORS_BY_POS) - 1)
        c  = colors.HexColor(_BAND_COLORS_BY_POS[idx])
        bg = colors.HexColor(_BAND_BG_COLORS_BY_POS[idx])
    else:
        l = (level or "").strip().lower()
        if l in ("critical", "very high"):
            c, bg = colors.HexColor("#dc2626"), colors.HexColor("#fee2e2")
        elif l == "high":
            c, bg = colors.HexColor("#ef4444"), colors.HexColor("#fef2f2")
        elif l == "medium":
            c, bg = colors.HexColor("#d97706"), colors.HexColor("#fffbeb")
        else:
            c, bg = colors.HexColor("#10b981"), colors.HexColor("#ecfdf5")
    badge = Table(
        [[Paragraph(level or "", ParagraphStyle(
            "lbg", fontName="Helvetica-Bold", fontSize=8,
            textColor=c, alignment=TA_CENTER,
        ))]],
        colWidths=[22 * mm],
    )
    badge.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), bg),
        ("TOPPADDING",   (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 2),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return badge


def _render_key_risk_movements(data: dict, _ai: str | None) -> list:
    out = _block_header("Key Risk Movements")

    if not data.get("has_data"):
        out.append(Paragraph(
            data.get("narrative", ""),
            ParagraphStyle(
                "krmna", fontName="Helvetica-Oblique", fontSize=9,
                textColor=colors.HexColor("#94a3b8"), leading=13,
            ),
        ))
        return out

    # Period note: prevMonthLabel → currMonthLabel
    prev_lbl = data.get("prev_month_label", "")
    curr_lbl = data.get("curr_month_label", "")
    if prev_lbl and curr_lbl:
        out.append(Paragraph(
            f"{prev_lbl} \u2192 {curr_lbl}",
            ParagraphStyle(
                "krmpd", fontName="Helvetica", fontSize=9,
                textColor=colors.HexColor("#94a3b8"), spaceAfter=8,
            ),
        ))

    _tbl_style = TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR",     (0, 0), (-1, 0), WHITE),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, LIGHT]),
        ("GRID",          (0, 0), (-1, -1), 0.25, BORDER),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ])

    _HEAD_S = ParagraphStyle(
        "krmsec", fontName="Helvetica-Bold", fontSize=9,
        spaceAfter=4, spaceBefore=10,
    )

    def _mov_section(
        title: str, arr: list, show_prev: bool, dot_color: colors.HexColor,
    ) -> None:
        if not arr:
            return
        out.append(Paragraph(
            f"{title.upper()} ({len(arr)})",
            ParagraphStyle(
                "krmsec_c", fontName="Helvetica-Bold", fontSize=9,
                textColor=dot_color, spaceAfter=4, spaceBefore=10,
            ),
        ))
        if show_prev:
            headers = ["ID", "Description", "Previous", "Current"]
            col_w   = [20 * mm, 70 * mm, 24 * mm, 24 * mm]
            rows = [headers] + [
                [
                    Paragraph(str(r.get("risk_id", "")), _S["body"]),
                    Paragraph((r.get("description") or "")[:100], _S["body"]),
                    Paragraph(r.get("previous_level", ""), ParagraphStyle(
                        "krmprev", fontName="Helvetica-Bold", fontSize=8,
                        textColor=_level_color(
                            r.get("previous_level", ""),
                            r.get("previous_level_index"),
                        ),
                    )),
                    _level_badge_cell(r.get("level", "")),
                ]
                for r in arr
            ]
        else:
            headers = ["ID", "Description", "Level"]
            col_w   = [20 * mm, 94 * mm, 24 * mm]
            rows = [headers] + [
                [
                    Paragraph(str(r.get("risk_id", "")), _S["body"]),
                    Paragraph((r.get("description") or "")[:100], _S["body"]),
                    _level_badge_cell(r.get("level", "")),
                ]
                for r in arr
            ]
        tbl = Table(rows, colWidths=col_w, repeatRows=1)
        tbl.setStyle(_tbl_style)
        out.append(tbl)

    _mov_section("Escalations",   data.get("escalations",   []), True,  RED)
    _mov_section("Reductions",    data.get("reductions",    []), True,  GREEN)
    _mov_section("New Risks",     data.get("new_risks",     []), False, AMBER)
    _mov_section("Removed Risks", data.get("removed_risks", []), False, MUTED)

    if data.get("narrative"):
        out.extend(_narrative(data.get("narrative")))

    return out


# ── Block renderer registry ────────────────────────────────────────────────────
_RENDERERS: dict[str, Any] = {
    "exposure-index":       _render_exposure_index,
    "risk-snapshot":        _render_risk_snapshot,
    "key-risk-changes":     _render_key_risk_changes,
    "incident-stability":   _render_incident_stability,
    "ai-exec-summary":      _render_ai_exec_summary,
    "executive-commentary": _render_executive_commentary,
    "exposure-trend":       _render_exposure_trend,
    "residual-risk-trend":  _render_residual_risk_trend,
    "risk-distribution":    _render_risk_distribution,
    "incident-trend":       _render_incident_trend,
    "top-risks":            _render_top_risks,
    "top-emerging-risks":   _render_top_emerging_risks,
    "major-incidents":      _render_major_incidents,
    "findings":             _render_findings,
    "recommendations":      _render_recommendations,
    "conclusion":           _render_conclusion,
    "risk-ownership":       _render_risk_ownership,
    "incident-analytics":   _render_incident_analytics,
    "executive-dashboard":  _render_executive_dashboard,
    "key-risk-movements":   _render_key_risk_movements,
}

_LABELS: dict[str, str] = {
    "exposure-index":       "Risk Health",
    "risk-snapshot":        "Risk Snapshot",
    "key-risk-changes":     "Key Risk Changes",
    "incident-stability":   "Incident Stability",
    "ai-exec-summary":      "Executive Summary",
    "executive-commentary": "Executive Commentary",
    "exposure-trend":       "Exposure Trend",
    "residual-risk-trend":  "Residual Risk Trend",
    "risk-distribution":    "Risk Distribution",
    "incident-trend":       "Incident Trend",
    "top-risks":            "Top Risks",
    "top-emerging-risks":   "Top Emerging Risks",
    "major-incidents":      "Major Incidents",
    "findings":             "Findings",
    "recommendations":      "Recommendations",
    "conclusion":           "Conclusion",
    "risk-ownership":       "Risk Ownership",
    "incident-analytics":   "Incident Analytics",
    "executive-dashboard":  "Executive Dashboard",
    "key-risk-movements":   "Key Risk Movements",
}


# ── Confidentiality pill chip ──────────────────────────────────────────────────

class _PillChip(Flowable):
    """Rounded pill chip drawn via canvas.roundRect().
    Reproduces the GAS border-radius pill treatment.
    Cannot be achieved with a ReportLab Table (no border-radius support)."""

    def __init__(self, text: str, width: float = 80.0, height: float = 14.0) -> None:
        super().__init__()
        self._text  = text.upper()
        self.width  = width   # points
        self.height = height  # points

    def wrap(self, avail_w: float, avail_h: float) -> tuple[float, float]:
        return self.width, self.height

    def draw(self) -> None:
        c = self.canv
        r = self.height / 2          # full pill radius = half height
        c.saveState()
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.75)
        c.setFillColor(WHITE)
        c.roundRect(0, 0, self.width, self.height, r, fill=1, stroke=1)
        dot_x = r + 4.0
        dot_y = self.height / 2
        c.setFillColor(NAVY)
        c.circle(dot_x, dot_y, 2.0, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(dot_x + 6.0, (self.height - 7.0) / 2, self._text)
        c.restoreState()


# ═══════════════════════════════════════════════════════════════════════════════
# PAGE TEMPLATES
# ═══════════════════════════════════════════════════════════════════════════════

def _make_doc(
    buf: io.BytesIO,
    title: str,
    org_name: str,
    is_landscape: bool,
) -> BaseDocTemplate:
    page   = landscape(A4) if is_landscape else A4
    margin = 15 * mm          # GAS portrait uses 15mm left/right margins → 180mm content width
    header_label = org_name or title

    def _on_cover_page(canvas, doc):
        canvas.saveState()
        accent = 52 * mm
        canvas.setFillColor(colors.Color(31 / 255, 40 / 255, 84 / 255, alpha=0.07))
        canvas.rect(page[0] - accent, page[1] - accent, accent, accent, fill=1, stroke=0)
        canvas.restoreState()

    def _on_page(canvas, doc):
        canvas.saveState()
        # Header bar — org name left, report type right
        canvas.setFillColor(NAVY)
        canvas.rect(0, page[1] - 14 * mm, page[0], 14 * mm, fill=1, stroke=0)
        canvas.setFillColor(WHITE)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawString(margin, page[1] - 9 * mm, header_label)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#94a3b8"))
        canvas.drawRightString(page[0] - margin, page[1] - 9 * mm, "Risk Management Report")
        # Footer is drawn by _make_canvas_cls — nothing here
        canvas.restoreState()

    doc = BaseDocTemplate(
        buf,
        pagesize=page,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=18 * mm,
        bottomMargin=14 * mm,
        title=title,
    )
    frame = Frame(
        margin, 14 * mm,
        page[0] - margin * 2,
        page[1] - 18 * mm - 14 * mm,
        id="content",
    )
    doc.addPageTemplates([
        PageTemplate(id="cover",   frames=[frame], onPage=_on_cover_page),
        PageTemplate(id="content", frames=[frame], onPage=_on_page),
    ])
    return doc


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

def build_pdf(
    blocks:      list[str],
    block_data:  dict,
    ai_data:     dict,
    settings_p:  dict,
    date_from:   str | None = None,
    date_to:     str | None = None,
    orientation: str = "portrait",
    org_name:    str = "",
    logo_bytes:  bytes | None = None,
) -> bytes:
    """
    Builds and returns a PDF as bytes.
    Source: Reportservice.gs api_buildAndExportPDF()
    """
    buf          = io.BytesIO()
    title        = settings_p.get("report_title") or "SmartRisk Report"
    is_landscape = orientation.lower() == "landscape"
    footer_text       = settings_p.get("footer_text") or "Confidential"
    show_page_numbers = settings_p.get("page_numbering", "Show") != "Hide"
    display_name      = org_name or title
    doc = _make_doc(buf, title, display_name, is_landscape)
    has_cover  = settings_p.get("cover_page", "Yes") != "No"
    canvas_cls = _make_canvas_cls(
        landscape(A4) if is_landscape else A4,
        display_name,
        footer_text,
        show_page_numbers,
        has_cover,
    )
    story: list = []

    _td       = date.today()
    today_str = f"{_td.strftime('%B')} {_td.day}, {_td.year}"

    # ── Cover page ─────────────────────────────────────────────────────────────
    if settings_p.get("cover_page", "Yes") != "No":
        from datetime import datetime as dt

        period = ""
        if date_from:
            try:
                _df  = dt.fromisoformat(date_from)
                _dt2 = dt.fromisoformat(date_to) if date_to else dt.now()
                period = (
                    f"{_df.day} {_df.strftime('%b %Y')}"
                    f" \u2013 "
                    f"{_dt2.day} {_dt2.strftime('%b %Y')}"
                )
            except Exception:
                period = today_str
        else:
            period = today_str

        brand_label   = org_name or title
        classif_label = settings_p.get("footer_text") or "Confidential"

        # ── Metadata 2x2 grid ─────────────────────────────────────────────────
        _mk = ParagraphStyle("ck", fontName="Helvetica-Bold", fontSize=7,
                             textColor=colors.HexColor("#8a98b0"), spaceBefore=0, spaceAfter=2,
                             wordWrap="LTR")
        _mv = ParagraphStyle("cv", fontName="Helvetica-Bold", fontSize=10,
                             textColor=NAVY, spaceBefore=0, spaceAfter=0)

        def _meta_cell(k: str, v: str) -> Table:
            return Table(
                [[Paragraph(k.upper(), _mk)], [Paragraph(v or "\u2014", _mv)]],
                colWidths=["100%"],
                style=TableStyle([
                    ("TOPPADDING",    (0, 0), (-1, -1), 11),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
                    ("LEFTPADDING",   (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
                ]),
            )

        ref_val = " \u00b7 ".join(filter(None, [
            settings_p.get("report_ref") or "\u2014",
            settings_p.get("version") or "v1.0",
        ]))
        meta_tbl = Table(
            [
                [_meta_cell("Prepared for",    settings_p.get("prepared_for") or ""),
                 _meta_cell("Date prepared",   today_str)],
                [_meta_cell("Distribution",    settings_p.get("distribution") or ""),
                 _meta_cell("Report reference", ref_val)],
            ],
            colWidths=["50%", "50%"],
        )
        meta_tbl.setStyle(TableStyle([
            # GAS: border-top on meta section, border-bottom on each row, border-left on right col only
            ("LINEABOVE",    (0, 0), (-1,  0),  0.5, BORDER),
            ("LINEBELOW",    (0, 0), (-1, -1),  0.5, BORDER),
            ("LINEBEFORE",   (1, 0), (1,  -1),  0.5, BORDER),
            ("VALIGN",       (0, 0), (-1, -1), "TOP"),
            # Left col: left:0, right:14
            ("LEFTPADDING",  (0, 0), (0,  -1), 0),
            ("RIGHTPADDING", (0, 0), (0,  -1), 14),
            # Right col: left:14, right:0
            ("LEFTPADDING",  (1, 0), (1,  -1), 14),
            ("RIGHTPADDING", (1, 0), (1,  -1), 0),
        ]))

        # ── Confidentiality chip (rounded pill via _PillChip) ─────────────────
        chip_para = _PillChip(classif_label, width=80.0, height=14.0)

        # ── Navy footer bar on cover ──────────────────────────────────────────
        cover_foot = Table(
            [[Paragraph(f'<font color="#ffffff"><b>{brand_label}</b></font>', ParagraphStyle(
                "cfl", fontName="Helvetica-Bold", fontSize=7, textColor=WHITE)),
              Paragraph(f'<font color="rgba(255,255,255,.7)">{ref_val}</font>', ParagraphStyle(
                "cfr", fontName="Helvetica", fontSize=7, textColor=colors.HexColor("#94a3b8"),
                alignment=TA_RIGHT))]],
            colWidths=["60%", "40%"],
        )
        cover_foot.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (-1, -1), NAVY),
            ("LEFTPADDING",  (0, 0), (-1, -1), 16),
            ("RIGHTPADDING", (0, 0), (-1, -1), 16),
            ("TOPPADDING",   (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 10),
            ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ]))

        # ── Cover vertical gap: push metadata toward page lower third.
        # Frame height = page height - topMargin - bottomMargin.
        # Estimated heights: top content (brand+48mm+eyebrow+title+period+rule) ≈ 90mm.
        # Bottom content (meta+spacer+disclaimer+footer) ≈ 57mm.
        # Remaining space is given to the gap so meta lands ~75% down the page.
        _ph          = (210 if is_landscape else 297) * mm
        _frame_h     = _ph - 18 * mm - 14 * mm
        _top_est     = 106 * mm if logo_bytes else 90 * mm
        _bot_est     = 78 * mm
        _meta_gap    = max(10 * mm, _frame_h - _top_est - _bot_est)

        # ── Cover body with navy left border ──────────────────────────────────
        cover_body = Table(
            [
                # Top row: brand name + classification chip
                [Table([[
                    Image(io.BytesIO(logo_bytes), width=44 * mm, height=22 * mm)
                    if logo_bytes else
                    Paragraph(brand_label, ParagraphStyle(
                        "corg", fontName="Helvetica-Bold", fontSize=15,
                        textColor=NAVY, spaceAfter=0,
                    )),
                    chip_para,
                ]], colWidths=["70%", "30%"],
                style=TableStyle([("VALIGN", (0,0),(-1,-1), "MIDDLE"),
                                  ("LEFTPADDING",(0,0),(-1,-1),0),
                                  ("RIGHTPADDING",(0,0),(-1,-1),0),
                                  ("ALIGN",   (1,0),(1,-1), "RIGHT")]))],

                [Spacer(1, 48 * mm)],

                # Eyebrow
                [Paragraph("RISK MANAGEMENT REPORT", ParagraphStyle(
                    "ey", fontName="Helvetica-Bold", fontSize=8, textColor=NAVY,
                    wordWrap="LTR", spaceAfter=6,
                ))],

                # Title — large
                [Paragraph(title, ParagraphStyle(
                    "ctitle", fontName="Times-Bold", fontSize=26,
                    textColor=NAVY, leading=32, spaceAfter=10,
                ))],

                # Period
                [Paragraph(f"Reporting period \u00b7 {period}", ParagraphStyle(
                    "cper", fontName="Helvetica", fontSize=11,
                    textColor=colors.HexColor("#5a6b8c"), spaceAfter=14,
                ))],

                # Navy rule
                [HRFlowable(width=52 * mm, thickness=3, color=NAVY, spaceAfter=14)],

                [Spacer(1, _meta_gap)],

                # Metadata grid
                [meta_tbl],

                [Spacer(1, 6 * mm)],

                # Disclaimer
                [Paragraph(
                    "This document contains confidential risk information prepared for the "
                    "named recipients only. It must not be copied, forwarded or distributed "
                    "without authorisation.",
                    ParagraphStyle(
                        "cdis", fontName="Helvetica", fontSize=7,
                        textColor=colors.HexColor("#8a98b0"), leading=11, spaceAfter=12,
                    ),
                )],

                # Navy footer bar
                [cover_foot],
            ],
            colWidths=["100%"],
        )
        cover_body.setStyle(TableStyle([
            ("VALIGN",      (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 14),
            ("RIGHTPADDING",(0, 0), (-1, -1), 0),
            ("TOPPADDING",  (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING",(0,0), (-1, -1), 0),
            ("LINEBEFORE",  (0, 0), (0, -1),  5, NAVY),
        ]))

        story.append(NextPageTemplate("cover"))
        story.append(cover_body)
        story.append(NextPageTemplate("content"))
        story.append(PageBreak())

    # ── Block pages ────────────────────────────────────────────────────────────

    for key in blocks:
        data = block_data.get(key)
        if not data:
            continue
        renderer = _RENDERERS.get(key)
        if not renderer:
            continue
        ai_text = ai_data.get(key) or None
        try:
            elements = renderer(data, ai_text)
        except Exception as exc:
            logger.error("PDF render error [%s]: %s", key, exc, exc_info=True)
            elements = _block_header(_LABELS.get(key, key)) + [
                Paragraph(f"Block could not be rendered: {exc}", _S["narrative"])
            ]
        story.extend(elements)
        story.append(Spacer(1, 5 * mm))

    # ── Sign-off ───────────────────────────────────────────────────────────────
    signoff = settings_p.get("signoff") or {}
    if signoff.get("include", True) and (signoff.get("prepared_by") or signoff.get("approved_by")):
        story.append(Spacer(1, 8 * mm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER))
        story.append(Spacer(1, 4 * mm))
        pb = "  ,  ".join(filter(None, [signoff.get("prepared_by"), signoff.get("prepared_title")]))
        ab = "  ,  ".join(filter(None, [signoff.get("approved_by"), signoff.get("approved_title")]))
        if pb:
            story.append(Paragraph(f"<b>Prepared by:</b>  {pb}", _S["body"]))
        if ab:
            story.append(Paragraph(f"<b>Approved by:</b>  {ab}", _S["body"]))

    doc.build(story, canvasmaker=canvas_cls)
    return buf.getvalue()