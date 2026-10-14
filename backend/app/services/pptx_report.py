# app/services/pptx_report.py
"""
PowerPoint (PPTX) export for the Report Builder.

Same inputs as pdf_report.build_pdf, so nothing upstream changes: the PDF and the
deck render one preview, one fact set and one set of AI narratives.

Deck shape (condensed, for presenting):
  1. Cover            org, title, period, logo, prepared for, sign-off
  2. Section slides   one headline slide per selected block, in canvas order
  3. Appendix         detail tables, paginated, in the same order
  4. Not included     blocks that were suppressed or had nothing to show

Everything is native and editable: charts are PowerPoint charts (data editable in
PowerPoint), tables are PowerPoint tables, text is in text boxes. Narratives and
AI text go into the speaker notes so the slides stay short.

Brand: Navy #1F2854, Teal #01b88e. Calibri throughout, because it ships with
Office and renders the same width everywhere, so text that fits here fits there.
"""

from __future__ import annotations

import io
import logging
import re
from datetime import date
from typing import Any, Callable

from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION, XL_LEGEND_POSITION
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

logger = logging.getLogger(__name__)

# ── Brand ──────────────────────────────────────────────────────────────────────
NAVY   = "1F2854"
TEAL   = "01B88E"
RED    = "DC2626"
AMBER  = "D97706"
GREEN  = "10B981"
MUTED  = "64748B"
INK    = "0F172A"
BODY   = "334155"
TINT   = "F4F6FA"
LIGHT  = "F8FAFC"
BORDER = "E2E8F0"
WHITE  = "FFFFFF"
FONT   = "Calibri"

SLIDE_W, SLIDE_H = 13.333, 7.5
MX = 0.6                       # side margin
CONTENT_TOP = 1.65             # below the title
CONTENT_BOTTOM = 6.75          # above the footer
CONTENT_W = SLIDE_W - 2 * MX

TABLE_ROWS_PER_SLIDE = 11
LEVEL_COLORS = {"low": GREEN, "medium": AMBER, "high": "EF4444", "critical": RED,
                "very high": RED, "extreme": "7F1D1D"}
BAND_POS_COLORS = [GREEN, AMBER, "EF4444", RED, "7F1D1D"]
HEAT_BG = {1: "DCFCE7", 2: "FEF3C7", 3: "FEE2E2", 4: "FECACA", 5: "FCA5A5"}
HEAT_FG = {1: "065F46", 2: "92400E", 3: "991B1B", 4: "7F1D1D", 5: "450A0A"}

LABELS: dict[str, str] = {
    "exposure-index": "Risk Health", "risk-snapshot": "Risk Snapshot",
    "key-risk-changes": "Key Risk Changes", "incident-stability": "Incident Stability",
    "ai-exec-summary": "Executive Summary", "executive-commentary": "Executive Commentary",
    "exposure-trend": "Exposure Trend", "residual-risk-trend": "Residual Risk Trend",
    "risk-distribution": "Risk Distribution", "incident-trend": "Incident Trend",
    "top-risks": "Top Risks", "top-emerging-risks": "Top Emerging Risks",
    "major-incidents": "Major Incidents", "findings": "Findings",
    "recommendations": "Recommendations", "conclusion": "Conclusion",
    "risk-ownership": "Risk Ownership", "incident-analytics": "Incident Analytics",
    "executive-dashboard": "Executive Dashboard", "methodology": "Methodology",
    "risk-heat-map": "Risk Heat Map", "risk-incident-correlation": "Risk & Incident Correlation",
}


# ═══════════════════════════════════════════════════════════════════════════════
# PRIMITIVES
# ═══════════════════════════════════════════════════════════════════════════════

def _rgb(hex_: str) -> RGBColor:
    return RGBColor.from_string(hex_.lstrip("#").upper()[:6])


def _hex(value: Any, fallback: str) -> str:
    s = str(value or "").lstrip("#")
    return s.upper() if re.fullmatch(r"[0-9a-fA-F]{6}", s) else fallback


def _clip(text: Any, w_in: float, h_in: float, size: float) -> str:
    """Cut text to what a w×h box holds at this size, ending on a word.
    python-pptx cannot shrink text to fit, so overflow is prevented up front.
    Average Calibri glyph ≈ 0.48 em; line height ≈ 1.2 em."""
    s = re.sub(r"\s+", " ", str(text or "")).strip()
    per_line = max(8, int(w_in * 72 / (size * 0.48)))
    lines = max(1, int(h_in * 72 / (size * 1.2)))
    cap = per_line * lines
    if len(s) <= cap:
        return s
    cut = s[: cap - 1].rsplit(" ", 1)[0].rstrip(",;:—- ")
    return cut + "…"


def _strip_tags(text: str | None) -> str:
    """Drop [RISK]/[OBSERVATION] style tags for slide text."""
    return re.sub(r"\[(RISK|OBSERVATION|OPPORTUNITY|RECOMMENDATION)\]\s*", "", str(text or "")).strip()


def _notes_tags(text: str | None) -> str:
    """Keep tags as readable labels in speaker notes."""
    return re.sub(r"\[(RISK|OBSERVATION|OPPORTUNITY|RECOMMENDATION)\]\s*",
                  lambda m: f"\n{m.group(1).title()}: ", str(text or "")).strip()


def _sentences(text: str | None) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", _strip_tags(text))
    return [p.strip() for p in parts if p and p.strip()]


def _text(slide, x, y, w, h, text, size=14, bold=False, color=BODY, align=PP_ALIGN.LEFT,
          anchor=MSO_ANCHOR.TOP, clip=True, italic=False, name="Text"):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tb.name = name
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    for side in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, side, 0)
    p = tf.paragraphs[0]
    p.alignment = align
    r = p.add_run()
    r.text = _clip(text, w, h, size) if clip else str(text or "")
    f = r.font
    f.name, f.size, f.bold, f.italic = FONT, Pt(size), bold, italic
    f.color.rgb = _rgb(color)
    return tb


def _runs(slide, x, y, w, h, runs: list[tuple[str, float, bool, str]], align=PP_ALIGN.LEFT,
          anchor=MSO_ANCHOR.TOP, name="Text"):
    """One paragraph of mixed runs: (text, size, bold, color)."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tb.name = name
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    for side in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, side, 0)
    p = tf.paragraphs[0]
    p.alignment = align
    for text, size, bold, color in runs:
        r = p.add_run()
        r.text = text
        r.font.name, r.font.size, r.font.bold = FONT, Pt(size), bold
        r.font.color.rgb = _rgb(color)
    return tb


def _lines(slide, x, y, w, h, items: list[str], size=14, color=BODY, bullet_color=TEAL,
           gap_pt=8, name="List", numbered=False):
    """Bulleted or numbered list. Items are clipped so the block fits h."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tb.name = name
    tf = tb.text_frame
    tf.word_wrap = True
    for side in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, side, 0)
    per_item_h = max(0.3, h / max(1, len(items)) - gap_pt / 72)
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(gap_pt)
        mark = p.add_run()
        mark.text = f"{i + 1}.  " if numbered else "■  "
        mark.font.name, mark.font.bold = FONT, True
        mark.font.size = Pt(size if numbered else size * 0.6)
        mark.font.color.rgb = _rgb(bullet_color)
        r = p.add_run()
        r.text = _clip(item, w - 0.3, per_item_h, size)
        r.font.name, r.font.size = FONT, Pt(size)
        r.font.color.rgb = _rgb(color)
    return tb


def _box(slide, x, y, w, h, fill=TINT, line=None, rounded=True, name="Card"):
    shp = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE if rounded else MSO_SHAPE.RECTANGLE,
        Inches(x), Inches(y), Inches(w), Inches(h),
    )
    shp.name = name
    if rounded:
        shp.adjustments[0] = 0.06
    shp.fill.solid()
    shp.fill.fore_color.rgb = _rgb(fill)
    if line:
        shp.line.color.rgb = _rgb(line)
        shp.line.width = Pt(0.75)
    else:
        shp.line.fill.background()
    shp.shadow.inherit = False
    return shp


def _tile(slide, x, y, w, h, value, unit, label, color=NAVY, note: str | None = None):
    """Stat tile: big number, small unit, label underneath."""
    _box(slide, x, y, w, h, name=f"Tile {label}")
    big = 60 if h >= 2.6 else 40 if h >= 1.6 else 30
    val_h = big / 72 * 1.25
    _runs(slide, x + 0.25, y + 0.2, w - 0.5, val_h,
          [(str(value), big, True, color), (f" {unit}" if unit else "", 16, False, MUTED)],
          anchor=MSO_ANCHOR.BOTTOM, name=f"Value {label}")
    label_h = 0.65 if h >= 2.0 else 0.32
    _text(slide, x + 0.25, y + 0.3 + val_h, w - 0.5, label_h, label, 13, True, MUTED,
          name=f"Label {label}")
    if note:
        _text(slide, x + 0.25, y + h - 0.5, w - 0.5, 0.35, note, 11, False, MUTED, name=f"Note {label}")


def _table(slide, x, y, w, headers: list[str], rows: list[list[Any]], widths: list[float],
           size=12, cell_colors: dict[tuple[int, int], str] | None = None, row_h=0.4):
    """Native table: navy header, light zebra rows, text clipped per column."""
    n_rows, n_cols = len(rows) + 1, len(headers)
    total = sum(widths)
    widths = [wd * w / total for wd in widths]
    gf = slide.shapes.add_table(n_rows, n_cols, Inches(x), Inches(y), Inches(w), Inches(row_h * n_rows))
    gf.name = "Table"
    tbl = gf.table
    tbl.first_row = True
    tbl.horz_banding = False
    for c, wd in enumerate(widths):
        tbl.columns[c].width = Inches(wd)
    for r in range(n_rows):
        tbl.rows[r].height = Inches(row_h)
    for r in range(n_rows):
        for c in range(n_cols):
            cell = tbl.cell(r, c)
            val = headers[c] if r == 0 else rows[r - 1][c]
            cell.fill.solid()
            cell.fill.fore_color.rgb = _rgb(NAVY if r == 0 else (WHITE if r % 2 else LIGHT))
            cell.margin_left = cell.margin_right = Inches(0.08)
            cell.margin_top = cell.margin_bottom = Inches(0.04)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            tf = cell.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            run = p.add_run()
            run.text = _clip(val if val not in (None, "") else "—", widths[c] - 0.16, row_h * 1.6, size)
            run.font.name, run.font.size = FONT, Pt(size)
            run.font.bold = r == 0
            colour = WHITE if r == 0 else INK
            if cell_colors and r > 0 and (r - 1, c) in cell_colors:
                colour = cell_colors[(r - 1, c)]
                run.font.bold = True
            run.font.color.rgb = _rgb(colour)
    return gf


def _style_chart(chart, legend=False, labels=True, number_format='0'):
    chart.font.name = FONT
    chart.font.size = Pt(12)
    chart.font.color.rgb = _rgb(MUTED)
    chart.has_title = False
    chart.has_legend = legend
    if legend:
        chart.legend.position = XL_LEGEND_POSITION.BOTTOM
        chart.legend.include_in_layout = False
        chart.legend.font.size = Pt(12)
    try:
        va = chart.value_axis
        va.has_major_gridlines = True
        va.major_gridlines.format.line.color.rgb = _rgb(BORDER)
        va.format.line.fill.background()
        va.tick_labels.font.size = Pt(11)
        ca = chart.category_axis
        ca.format.line.color.rgb = _rgb(BORDER)
        ca.tick_labels.font.size = Pt(11)
        ca.has_major_gridlines = False
    except (ValueError, AttributeError):
        pass  # doughnut has no axes
    if labels:
        plot = chart.plots[0]
        plot.has_data_labels = True
        dl = plot.data_labels
        dl.font.size = Pt(11)
        dl.font.color.rgb = _rgb(INK)
        dl.number_format = number_format
        dl.number_format_is_linked = False


def _column_chart(slide, x, y, w, h, cats, series: list[tuple[str, list, str]],
                  horizontal=False, legend=False):
    cd = CategoryChartData()
    cd.categories = [str(c) for c in cats]
    for name, vals, _ in series:
        cd.add_series(name, [float(v or 0) for v in vals])
    kind = XL_CHART_TYPE.BAR_CLUSTERED if horizontal else XL_CHART_TYPE.COLUMN_CLUSTERED
    gf = slide.shapes.add_chart(kind, Inches(x), Inches(y), Inches(w), Inches(h), cd)
    gf.name = "Chart"
    ch = gf.chart
    _style_chart(ch, legend=legend)
    ch.plots[0].gap_width = 70
    if len(series) > 1:
        ch.plots[0].overlap = -10
    for s, (_, _, color) in zip(ch.series, series):
        s.format.fill.solid()
        s.format.fill.fore_color.rgb = _rgb(color)
    if horizontal:
        ch.category_axis.reverse_order = True
        ch.plots[0].data_labels.position = XL_LABEL_POSITION.OUTSIDE_END
    return ch


def _line_chart(slide, x, y, w, h, cats, vals, color=NAVY, name="Value"):
    cd = CategoryChartData()
    cd.categories = [str(c) for c in cats]
    cd.add_series(name, [float(v or 0) for v in vals])
    gf = slide.shapes.add_chart(XL_CHART_TYPE.LINE_MARKERS, Inches(x), Inches(y), Inches(w), Inches(h), cd)
    gf.name = "Chart"
    ch = gf.chart
    _style_chart(ch, number_format='0.#')
    s = ch.series[0]
    s.format.line.color.rgb = _rgb(color)
    s.format.line.width = Pt(2.75)
    s.smooth = False
    s.marker.size = 8
    s.marker.format.fill.solid()
    s.marker.format.fill.fore_color.rgb = _rgb(color)
    s.marker.format.line.color.rgb = _rgb(color)
    ch.plots[0].data_labels.position = XL_LABEL_POSITION.ABOVE
    return ch


def _doughnut(slide, x, y, w, h, cats, vals, point_colors):
    cd = CategoryChartData()
    cd.categories = [str(c) for c in cats]
    cd.add_series("Risks", [float(v or 0) for v in vals])
    gf = slide.shapes.add_chart(XL_CHART_TYPE.DOUGHNUT, Inches(x), Inches(y), Inches(w), Inches(h), cd)
    gf.name = "Chart"
    ch = gf.chart
    _style_chart(ch, legend=True)
    for pt, col in zip(ch.series[0].points, point_colors):
        pt.format.fill.solid()
        pt.format.fill.fore_color.rgb = _rgb(col)
    ch.plots[0].data_labels.font.color.rgb = _rgb(WHITE)
    ch.plots[0].data_labels.font.bold = True
    return ch


def _level_colour(level: Any, level_index: Any = None) -> str:
    if isinstance(level_index, int) and level_index >= 1:
        return BAND_POS_COLORS[min(level_index, len(BAND_POS_COLORS)) - 1]
    return LEVEL_COLORS.get(str(level or "").lower(), MUTED)


def _fmt_date(iso: Any) -> str:
    try:
        d = date.fromisoformat(str(iso)[:10])
        return f"{d.day} {d:%b %Y}"
    except (ValueError, TypeError):
        return ""


# ═══════════════════════════════════════════════════════════════════════════════
# DECK CONTEXT
# ═══════════════════════════════════════════════════════════════════════════════

class Deck:
    def __init__(self, org: str, title: str, footer: str, period: str,
                 logo: tuple[bytes, float] | None, numbering: bool):
        self.prs = Presentation()
        self.prs.slide_width = Inches(SLIDE_W)
        self.prs.slide_height = Inches(SLIDE_H)
        self.blank = self.prs.slide_layouts[6]
        self.org, self.title, self.footer, self.period = org, title, footer, period
        self.logo = logo            # (png bytes, width/height)
        self.numbering = numbering
        self.appendix: list[tuple[str, Callable]] = []   # (block label, builder)
        self.omitted: list[tuple[str, str]] = []         # (label, reason)

    def _place_logo(self, slide, x_right, y, max_w, max_h):
        if not self.logo:
            return
        data, ratio = self.logo
        w = min(max_w, max_h * ratio)
        h = w / ratio
        pic = slide.shapes.add_picture(io.BytesIO(data), Inches(x_right - w), Inches(y + (max_h - h) / 2),
                                       Inches(w), Inches(h))
        pic.name = "Logo"

    def content_slide(self, title: str, kicker: str = "", notes: str = ""):
        s = self.prs.slides.add_slide(self.blank)
        if kicker:
            _text(s, MX, 0.38, 8.5, 0.3, kicker.upper(), 11, True, TEAL, name="Kicker")
        _text(s, MX, 0.66, 9.6, 0.75, title, 30, True, NAVY, anchor=MSO_ANCHOR.TOP, name="Title")
        self._place_logo(s, SLIDE_W - MX, 0.4, 1.7, 0.6)
        foot = "  ·  ".join(filter(None, [self.org, self.title, self.footer]))
        _text(s, MX, 7.0, 9.5, 0.3, foot, 10, False, MUTED, name="Footer")
        if self.numbering:
            _text(s, SLIDE_W - MX - 1.0, 7.0, 1.0, 0.3, str(len(self.prs.slides)), 10, False, MUTED,
                  align=PP_ALIGN.RIGHT, name="Slide number")
        if notes:
            s.notes_slide.notes_text_frame.text = notes.strip()
        return s

    def divider(self, title: str, subtitle: str):
        s = self.prs.slides.add_slide(self.blank)
        bg = s.background.fill
        bg.solid()
        bg.fore_color.rgb = _rgb(NAVY)
        _text(s, MX, 2.9, 10, 0.9, title, 40, True, WHITE, name="Title")
        _text(s, MX, 3.85, 10, 0.5, subtitle, 16, False, "CBD5E1", name="Subtitle")
        return s


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION RENDERERS — one headline slide each; detail queued for the appendix
# Signature: (deck, data, ai_text, label) -> bool  (False = nothing to show)
# ═══════════════════════════════════════════════════════════════════════════════

def _notes(*parts: Any) -> str:
    return "\n\n".join(_notes_tags(p) for p in parts if p)


def _kpis_row(slide, kpis: list[dict], y: float, h: float = 1.75):
    n = len(kpis)
    gap = 0.3
    w = (CONTENT_W - gap * (n - 1)) / n
    for i, k in enumerate(kpis):
        _tile(slide, MX + i * (w + gap), y, w, h, k.get("value", "—"), k.get("unit", ""),
              k.get("label", ""), _hex(k.get("color"), NAVY), k.get("note"))


def _callout(slide, x, y, w, h, heading: str, body: str, accent=TEAL, size=15):
    _box(slide, x, y, w, h, fill=TINT, name="Callout")
    _text(slide, x + 0.3, y + 0.22, w - 0.6, 0.3, heading.upper(), 11, True, accent, name="Callout heading")
    _text(slide, x + 0.3, y + 0.6, w - 0.6, h - 0.8, body, size, False, INK, name="Callout body")


def r_exposure_index(d: Deck, data, ai, label):
    if data.get("no_data"):
        return False
    s = d.content_slide(label, "Risk posture", _notes(data.get("narrative"), ai))
    health_col = _hex(data.get("health_color"), TEAL)
    _tile(s, MX, CONTENT_TOP + 0.2, 3.6, 3.4, data.get("health", "—"), "/100", "Risk Health", health_col,
          data.get("health_label"))
    _tile(s, MX + 3.9, CONTENT_TOP + 0.2, 3.6, 3.4, data.get("score", "—"), "/100", "Exposure Index", NAVY,
          f"{data.get('label', '')} exposure")
    _callout(s, MX + 7.8, CONTENT_TOP + 0.2, CONTENT_W - 7.8, 3.4, "What it means",
             _strip_tags(ai) or data.get("narrative", ""), size=18)
    return True


def r_executive_dashboard(d: Deck, data, ai, label):
    if data.get("no_data") or not data.get("kpis"):
        return False
    posture = data.get("posture") or {}
    bullets = _sentences(ai) if ai else list(data.get("bullets") or [])
    s = d.content_slide(label, f"Posture: {posture.get('status', '—')} · trend {posture.get('trend', '—').lower()}",
                        _notes(" ".join(data.get("bullets") or []), ai))
    kpis = data["kpis"][:6]
    cols, gap = 3, 0.25
    grid_w = 7.6
    tw = (grid_w - gap * (cols - 1)) / cols
    th = 2.25
    for i, k in enumerate(kpis):
        r, c = divmod(i, cols)
        arrow = {"up": "▲", "down": "▼"}.get(k.get("direction") or "", "")
        note = f"{arrow} was {k['prev']}" if k.get("prev") is not None else None
        _tile(s, MX + c * (tw + gap), CONTENT_TOP + 0.1 + r * (th + gap), tw, th,
              k.get("value", "—"), k.get("unit", ""), k.get("label", ""), _hex(k.get("color"), NAVY), note)
    hx = MX + grid_w + 0.4
    _box(s, hx, CONTENT_TOP + 0.1, CONTENT_W - grid_w - 0.4, 2 * th + gap, fill=TINT, name="Highlights")
    _text(s, hx + 0.3, CONTENT_TOP + 0.35, 3, 0.3, "HIGHLIGHTS", 11, True, TEAL)
    _lines(s, hx + 0.3, CONTENT_TOP + 0.8, CONTENT_W - grid_w - 1.0, 2 * th + gap - 1.0, bullets[:4], size=14)
    return True


def r_risk_snapshot(d: Deck, data, ai, label):
    if not data.get("total"):
        return False
    s = d.content_slide(label, "Register at a glance", _notes(data.get("narrative")))
    for i, (v, u, lbl, col) in enumerate([
        (data.get("total"), "", "Active risks", NAVY),
        (data.get("high_count"), "", "Elevated", RED),
        (data.get("avg_residual"), f"/{data.get('residual_max', 25)}", "Average residual", MUTED),
    ]):
        _tile(s, MX, CONTENT_TOP + 0.1 + i * 1.7, 3.4, 1.5, v, u, lbl, col)
    by_level = data.get("by_level") or {}
    if by_level:
        rank = {k: i for i, k in enumerate(["low", "medium", "high", "critical", "very high", "extreme"])}
        cats = sorted(by_level, key=lambda k: rank.get(str(k).lower(), 99))
        _column_chart(s, MX + 3.8, CONTENT_TOP, CONTENT_W - 3.8, 4.9, cats, [("Risks", [by_level[c] for c in cats], NAVY)])
        ch_series = s.shapes[-1].chart.series[0]
        for pt, c in zip(ch_series.points, cats):
            pt.format.fill.solid()
            pt.format.fill.fore_color.rgb = _rgb(_level_colour(c))
    return True


def r_key_risk_changes(d: Deck, data, ai, label):
    s = d.content_slide(label, "Movement this period", _notes(data.get("narrative") or data.get("note")))
    _kpis_row(s, [
        {"value": data.get("increased", 0), "label": "Increased in severity", "color": RED},
        {"value": data.get("decreased", 0), "label": "Decreased in severity", "color": GREEN},
        {"value": data.get("new_high_risks", 0), "label": "New high risks", "color": AMBER},
    ], CONTENT_TOP + 0.2, 2.0)
    _callout(s, MX, CONTENT_TOP + 2.6, CONTENT_W, 1.6, "Summary", data.get("narrative") or data.get("note") or "")
    return True


def _incident_tiles(s, data):
    mttr = data.get("mttr_days")
    _kpis_row(s, [
        {"value": data.get("total", 0), "label": "Incidents", "color": NAVY},
        {"value": data.get("open", 0), "label": "Open", "color": RED},
        {"value": data.get("closed", 0), "label": "Closed", "color": GREEN},
        {"value": mttr if mttr is not None else "—", "unit": "days" if mttr is not None else "", "label": "Mean time to resolve", "color": AMBER},
    ], CONTENT_TOP + 0.05, 1.5)


def r_incident_stability(d: Deck, data, ai, label):
    if not data.get("total"):
        return False
    s = d.content_slide(label, "Incidents in the period", _notes(data.get("narrative")))
    _incident_tiles(s, data)
    sev = data.get("by_severity") or {}
    if sev:
        cats = sorted(sev, key=lambda k: -sev[k])
        _column_chart(s, MX, CONTENT_TOP + 1.8, CONTENT_W, 3.25, cats, [("Incidents", [sev[c] for c in cats], NAVY)])
    return True


def r_incident_analytics(d: Deck, data, ai, label):
    if not data.get("total"):
        return False
    s = d.content_slide(label, "Where incidents come from", _notes(data.get("narrative"), ai))
    _incident_tiles(s, data)
    cat = data.get("by_category") or {}
    if cat:
        cats = sorted(cat, key=lambda k: -cat[k])[:8]
        _column_chart(s, MX, CONTENT_TOP + 1.8, CONTENT_W, 3.25, cats, [("Incidents", [cat[c] for c in cats], NAVY)],
                      horizontal=True)
    return True


def r_ai_exec_summary(d: Deck, data, ai, label):
    items = _sentences(ai)[:3] if ai else list(data.get("paragraphs") or [])[:3]
    if not items:
        return False
    s = d.content_slide(label, "The main message", _notes(ai or " ".join(data.get("paragraphs") or [])))
    _box(s, MX, CONTENT_TOP + 0.1, CONTENT_W, 3.9, fill=TINT, name="Summary")
    _lines(s, MX + 0.45, CONTENT_TOP + 0.5, CONTENT_W - 0.9, 3.2, items, size=20, gap_pt=20, numbered=True)
    return True


def r_executive_commentary(d: Deck, data, ai, label):
    text = ai or data.get("text")
    if not text:
        return False
    parts: dict[str, str] = {}
    for key in ("Observation", "Impact", "Recommended Focus"):
        m = re.search(rf"{key}\s*:\s*(.+?)(?=\n\s*(?:Observation|Impact|Recommended Focus)\s*:|\Z)", text, re.S | re.I)
        if m:
            parts[key] = m.group(1).strip()
    s = d.content_slide(label, "Chief Risk Officer's view", _notes(text))
    if not parts:
        _callout(s, MX, CONTENT_TOP + 0.1, CONTENT_W, 4.9, "Commentary", text)
        return True
    gap = 0.3
    w = (CONTENT_W - 2 * gap) / 3
    for i, (key, accent) in enumerate([("Observation", NAVY), ("Impact", RED), ("Recommended Focus", TEAL)]):
        _callout(s, MX + i * (w + gap), CONTENT_TOP + 0.1, w, 3.6, key, parts.get(key, "—"), accent, size=18)
    return True


def _trend(d: Deck, data, ai, label, key, colour, series_name):
    pts = data.get("points") or []
    if len(pts) < 2:
        return False
    s = d.content_slide(label, "Trend", _notes(data.get("narrative"), ai))
    _line_chart(s, MX, CONTENT_TOP, CONTENT_W, 3.9, [p.get("label") for p in pts], [p.get(key) for p in pts],
                colour, series_name)
    _text(s, MX, CONTENT_TOP + 4.1, CONTENT_W, 0.8, data.get("narrative", ""), 14, False, BODY, name="Caption")
    return True


def r_exposure_trend(d, data, ai, label):
    return _trend(d, data, ai, label, "score", NAVY, "Exposure index")


def r_residual_risk_trend(d, data, ai, label):
    return _trend(d, data, ai, label, "avg", TEAL, "Average residual")


def r_incident_trend(d: Deck, data, ai, label):
    pts = data.get("points") or []
    if not pts:
        return False
    s = d.content_slide(label, "Incidents per month", _notes(data.get("narrative"), ai))
    _column_chart(s, MX, CONTENT_TOP, CONTENT_W, 3.9, [p.get("label") for p in pts],
                  [("Incidents", [p.get("count") for p in pts], NAVY)])
    _text(s, MX, CONTENT_TOP + 4.1, CONTENT_W, 0.8, data.get("narrative", ""), 14, False, BODY, name="Caption")
    return True


def r_risk_distribution(d: Deck, data, ai, label):
    by_level, by_cat = data.get("by_level") or {}, data.get("by_category") or {}
    if not by_level and not by_cat:
        return False
    s = d.content_slide(label, "How the register is spread", _notes(data.get("narrative")))
    if by_level:
        order = [b for b in (data.get("band_labels") or []) if b in by_level] + \
                [k for k in by_level if k not in (data.get("band_labels") or [])]
        _doughnut(s, MX, CONTENT_TOP, 5.2, 4.9, order, [by_level[k] for k in order],
                  [_level_colour(k) for k in order])
    if by_cat:
        cats = sorted(by_cat, key=lambda k: -by_cat[k])[:8]
        _text(s, MX + 5.7, CONTENT_TOP, 5, 0.3, "RISKS BY CATEGORY", 11, True, TEAL)
        _column_chart(s, MX + 5.6, CONTENT_TOP + 0.35, CONTENT_W - 5.6, 4.55, cats,
                      [("Risks", [by_cat[c] for c in cats], NAVY)], horizontal=True)
    return True


def _risk_tables(d: Deck, risks: list[dict], label: str, emerging: bool):
    """Headline: top 5 compact. Appendix: full list with descriptions."""
    hdr = ["ID", "Category", "Level", "Residual", "Appetite" if not emerging else "Logged"]
    def row(r):
        return [r.get("id"), r.get("category"), r.get("level"), r.get("residual"),
                (r.get("appetite_status") or "Not set") if not emerging else _fmt_date(r.get("logged"))]
    def colours(rows):
        return {(i, 2): _level_colour(r.get("level"), r.get("level_index")) for i, r in enumerate(rows)}
    return hdr, row, colours


def _risk_list(d: Deck, data, ai, label, emerging: bool):
    risks = data.get("risks") or []
    if not risks:
        return False
    hdr, row, colours = _risk_tables(d, risks, label, emerging)
    s = d.content_slide(label, f"{len(risks)} in focus · full list in the appendix",
                        _notes(data.get("intro"), ai))
    top = risks[:5]
    tw = 7.4 if ai else CONTENT_W
    _table(s, MX, CONTENT_TOP + 0.1, tw, hdr, [row(r) for r in top], [1.1, 2.0, 1.3, 1.1, 1.4],
           size=14, cell_colors=colours(top), row_h=0.55)
    if ai:
        _callout(s, MX + tw + 0.35, CONTENT_TOP + 0.1, CONTENT_W - tw - 0.35, 4.9, "Assessment", _strip_tags(ai))

    def appendix(d: Deck):
        hdr2 = ["ID", "Category", "Description", "Owner", "Level", "Residual", "Treatment"]
        for page, chunk in _pages(risks):
            sl = d.content_slide(f"{label}{page}", "Appendix")
            _table(sl, MX, CONTENT_TOP, CONTENT_W, hdr2,
                   [[r.get("id"), r.get("category"), r.get("desc"), r.get("owner") or "Unassigned", r.get("level"),
                     r.get("residual"), r.get("treatment")] for r in chunk],
                   [0.9, 1.4, 4.2, 1.9, 1.0, 0.9, 1.3], size=11,
                   cell_colors={(i, 4): _level_colour(r.get("level"), r.get("level_index")) for i, r in enumerate(chunk)})
    d.appendix.append((label, appendix))
    return True


def r_top_risks(d, data, ai, label):
    return _risk_list(d, data, ai, label, emerging=False)


def r_top_emerging_risks(d, data, ai, label):
    return _risk_list(d, data, ai, label, emerging=True)


def r_major_incidents(d: Deck, data, ai, label):
    incs = data.get("incidents") or []
    if not incs:
        return False
    s = d.content_slide(label, f"{len(incs)} high-impact incidents · detail in the appendix",
                        _notes(data.get("intro"), ai))
    top = incs[:5]
    tw = 7.4 if ai else CONTENT_W
    _table(s, MX, CONTENT_TOP + 0.1, tw, ["ID", "Category", "Severity", "Status"],
           [[i.get("id"), i.get("category"), i.get("severity"), i.get("status")] for i in top],
           [1.6, 2.0, 1.3, 1.3], size=14, row_h=0.55,
           cell_colors={(n, 2): _level_colour(i.get("severity")) for n, i in enumerate(top)})
    if ai:
        _callout(s, MX + tw + 0.35, CONTENT_TOP + 0.1, CONTENT_W - tw - 0.35, 4.9, "What they expose", _strip_tags(ai))

    def appendix(d: Deck):
        for page, chunk in _pages(incs):
            sl = d.content_slide(f"{label}{page}", "Appendix")
            _table(sl, MX, CONTENT_TOP, CONTENT_W, ["ID", "Reported", "Category", "Description", "Severity", "Status"],
                   [[i.get("id"), _fmt_date(i.get("date_reported")), i.get("category"), i.get("desc"),
                     i.get("severity"), i.get("status")] for i in chunk],
                   [1.5, 1.3, 1.6, 4.6, 1.1, 1.2], size=11)
    d.appendix.append((label, appendix))
    return True


def r_findings(d: Deck, data, ai, label):
    cols = [("Key risks", data.get("key_risks") or [], RED),
            ("Needs attention", data.get("areas_for_attention") or [], AMBER),
            ("Positive signals", data.get("positive_signals") or [], GREEN)]
    if not any(items for _, items, _ in cols):
        return False
    gaps = (data.get("assurance_gaps") or []) + (data.get("governance_gaps") or [])
    s = d.content_slide(label, "What the evidence shows",
                        _notes("\n".join(f"- {f}" for _, items, _ in cols for f in items)))
    gap = 0.3
    w = (CONTENT_W - 2 * gap) / 3
    for i, (head, items, accent) in enumerate(cols):
        x = MX + i * (w + gap)
        _box(s, x, CONTENT_TOP + 0.1, w, 4.1, fill=TINT, name=head)
        _text(s, x + 0.3, CONTENT_TOP + 0.35, w - 0.6, 0.3, f"{head.upper()}  ·  {len(items)}", 11, True, accent)
        _lines(s, x + 0.3, CONTENT_TOP + 0.85, w - 0.6, 3.15, items[:3] or ["None this period."], size=15,
               bullet_color=accent)
    if gaps:
        _text(s, MX, CONTENT_TOP + 4.45, CONTENT_W, 0.3,
              f"{len(gaps)} assurance and governance gaps are listed in the appendix.", 12, False, MUTED, italic=True)

    if gaps:
        def appendix(d: Deck):
            sl = d.content_slide("Assurance and governance gaps", f"Appendix · {label}")
            _lines(sl, MX, CONTENT_TOP + 0.1, CONTENT_W, 4.9, gaps[:8], size=15, bullet_color=AMBER)
        d.appendix.append((label, appendix))
    return True


def r_recommendations(d: Deck, data, ai, label):
    recs = data.get("recommendations") or []
    if not recs:
        return False
    s = d.content_slide(label, "Actions for this period", _notes(data.get("intro")))
    prio_col = {"critical": RED, "high": AMBER, "medium": TEAL, "low": MUTED}
    show = recs[:4]
    gap = 0.3
    w = (CONTENT_W - gap) / 2
    h = (4.9 - gap) / 2
    for i, r in enumerate(show):
        row_, col_ = divmod(i, 2)
        x, y = MX + col_ * (w + gap), CONTENT_TOP + 0.1 + row_ * (h + gap)
        accent = prio_col.get(str(r.get("priority", "")).lower(), NAVY)
        _box(s, x, y, w, h, fill=TINT, name=f"Recommendation {i + 1}")
        _text(s, x + 0.3, y + 0.22, w - 0.6, 0.3,
              f"{str(r.get('priority', '')).upper()}  ·  DUE IN {str(r.get('due', '')).upper()}", 11, True, accent)
        _text(s, x + 0.3, y + 0.58, w - 0.6, 0.85, r.get("title", ""), 17, True, NAVY)
        _text(s, x + 0.3, y + h - 0.5, w - 0.6, 0.3, f"Owner: {r.get('owner') or 'Not specified'}", 12, False, MUTED)
    if len(recs) > 4:
        _text(s, MX, CONTENT_BOTTOM - 0.05, CONTENT_W, 0.3, f"{len(recs) - 4} more in the appendix.", 11, False, MUTED,
              italic=True)

    def appendix(d: Deck):
        for page, chunk in _pages(recs, 5):
            sl = d.content_slide(f"{label}{page}", "Appendix")
            _table(sl, MX, CONTENT_TOP, CONTENT_W, ["Action", "Priority", "Owner", "Due", "Why", "Done when"],
                   [[r.get("title"), r.get("priority"), r.get("owner"), r.get("due"), r.get("trigger"),
                     r.get("completion_criterion")] for r in chunk],
                   [2.8, 1.0, 1.7, 0.8, 2.6, 3.2], size=11, row_h=0.85,
                   cell_colors={(n, 1): prio_col.get(str(r.get("priority", "")).lower(), NAVY)
                                for n, r in enumerate(chunk)})
    d.appendix.append((label, appendix))
    return True


def r_conclusion(d: Deck, data, ai, label):
    text = _strip_tags(ai) or data.get("text")
    if not text:
        return False
    s = d.prs.slides.add_slide(d.blank)
    bg = s.background.fill
    bg.solid()
    bg.fore_color.rgb = _rgb(NAVY)
    _text(s, MX, 2.1, 6, 0.4, "OVERALL RISK POSTURE", 12, True, TEAL)
    _text(s, MX, 2.5, 8, 1.0, data.get("status", ""), 54, True, WHITE)
    _text(s, MX, 3.75, 10.5, 1.8, text, 18, False, "E2E8F0")
    s.notes_slide.notes_text_frame.text = _notes(data.get("text"), ai)
    return True


def r_risk_ownership(d: Deck, data, ai, label):
    owners = data.get("top_owners") or []
    if not owners:
        return False
    s = d.content_slide(label, "Who carries the risk", _notes(data.get("narrative"), ai))
    top = owners[:6]
    _column_chart(s, MX, CONTENT_TOP, 8.0, 4.9, [o.get("owner") for o in top],
                  [("All risks", [o.get("total_count") for o in top], "94A3B8"),
                   ("High risks", [o.get("high_count") for o in top], RED)], horizontal=True, legend=True)
    _tile(s, MX + 8.4, CONTENT_TOP + 0.1, CONTENT_W - 8.4, 2.2, data.get("concentration", 0), "%",
          "of high risks held by the top three owners", NAVY)
    _tile(s, MX + 8.4, CONTENT_TOP + 2.6, CONTENT_W - 8.4, 2.2, data.get("all_high_count", 0), "",
          "High risks in total", RED)

    def appendix(d: Deck):
        for page, chunk in _pages(owners):
            sl = d.content_slide(f"{label}{page}", "Appendix")
            _table(sl, MX, CONTENT_TOP, CONTENT_W, ["Owner", "Risks", "High", "Avg residual", "Main category"],
                   [[o.get("owner"), o.get("total_count"), o.get("high_count"), o.get("avg_residual"),
                     o.get("top_category")] for o in chunk], [3.6, 1.2, 1.2, 1.6, 3.0], size=12)
    d.appendix.append((label, appendix))
    return True


def r_risk_heat_map(d: Deck, data, ai, label):
    grid = data.get("grid") or []
    if not grid:
        return False
    i_scale = len(grid[0])
    s = d.content_slide(label, f"Likelihood × impact · {data.get('total_placed', 0)} of "
                               f"{data.get('active_risks', 0)} risks placed",
                        _notes(f"{data.get('unplaced', 0)} risks could not be placed on the grid."
                               if data.get("unplaced") else ""))
    gx, gy, axis = MX + 0.9, CONTENT_TOP + 0.05, 0.45
    gw, gh = 8.4, 4.55
    cw, chh = gw / i_scale, gh / len(grid)
    for r_i, row in enumerate(grid):
        _text(s, gx - axis, gy + r_i * chh, axis - 0.1, chh, str(row[0].get("likelihood", "")), 13, True, MUTED,
              align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
        for c_i, cell in enumerate(row):
            band = int(cell.get("band_index") or 1)
            x, y = gx + c_i * cw, gy + r_i * chh
            box = _box(s, x + 0.03, y + 0.03, cw - 0.06, chh - 0.06, fill=HEAT_BG.get(band, LIGHT), rounded=False,
                       name=f"Cell L{cell.get('likelihood')} I{cell.get('impact')}")
            ids = [r.get("short_id") or r.get("id") for r in cell.get("risks") or []]
            if ids:
                shown = ", ".join(ids[:2]) + (f" +{len(ids) - 2}" if len(ids) > 2 else "")
                _runs(s, x + 0.08, y + 0.05, cw - 0.16, chh - 0.1,
                      [(f"{len(ids)}\n", 20, True, HEAT_FG.get(band, INK)), (shown, 10, False, HEAT_FG.get(band, INK))],
                      align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    for c_i in range(i_scale):
        _text(s, gx + c_i * cw, gy + gh + 0.08, cw, 0.3, str(grid[0][c_i].get("impact", c_i + 1)), 13, True, MUTED,
              align=PP_ALIGN.CENTER)
    _text(s, gx, gy + gh + 0.38, gw, 0.3, "IMPACT", 11, True, MUTED, align=PP_ALIGN.CENTER)
    _text(s, MX - 0.05, gy + gh / 2 - 0.15, 0.5, 0.3, "LIKELI-\nHOOD", 9, True, MUTED, clip=False)
    # legend
    lx = gx + gw + 0.6
    _text(s, lx, gy, 3, 0.3, "BANDS", 11, True, TEAL)
    for b, name in enumerate(data.get("band_labels") or [], start=1):
        _box(s, lx, gy + 0.45 + (b - 1) * 0.5, 0.35, 0.35, fill=HEAT_BG.get(b, LIGHT), rounded=False)
        _text(s, lx + 0.5, gy + 0.47 + (b - 1) * 0.5, 2.4, 0.35, name, 14, False, INK)
    return True


def r_risk_incident_correlation(d: Deck, data, ai, label):
    if data.get("no_data"):
        return False
    mat, unl, ctl = data.get("materialised") or {}, data.get("unlinked") or {}, data.get("controls") or {}
    n_mat, n_con = int(mat.get("count") or 0), int(ctl.get("contradicted") or 0)
    uncov = unl.get("uncovered_categories") or []
    kicker = "What the two registers say about each other"
    if data.get("indicative"):
        kicker += " · indicative"
    notes = [data.get("narrative"),
             "A link records an association made at triage. It is not a finding of cause."]
    if uncov:
        notes.append("Coverage is read from the category mapping in Settings; an unmapped category reads as uncovered.")
    s = d.content_slide(label, kicker, _notes(*notes))
    cards = [
        ("Risks that materialised", n_mat, f"of {data.get('risks_total', 0)} risks", AMBER,
         "On the register, with at least one incident linked to them in this period.",
         " · ".join((mat.get("ids") or [])[:4])),
        ("Incidents with no matching risk", int(unl.get("count") or 0), f"of {data.get('incidents_total', 0)} incidents",
         RED, "Incidents with no link to a register risk." +
         (f" Across all incidents, {len(uncov)} {'category has' if len(uncov) == 1 else 'categories have'} "
          "no covering risk category." if uncov else ""),
         " · ".join(uncov[:3])),
        ("Control ratings vs reality", n_con, f"of {n_mat} materialised" if n_mat else "contradicted",
         RED if n_con else GREEN,
         "Rated highly, yet an incident was still linked to the risk. The first ratings to test."
         if n_mat else "No risks materialised, so no rating was contradicted.",
         f"{ctl.get('evidenced', 0)} of {ctl.get('rated', 0)} ratings carry a recent independent test"),
    ]
    gap = 0.3
    w = (CONTENT_W - 2 * gap) / 3
    for i, (title, val, of, col, explain, detail) in enumerate(cards):
        x = MX + i * (w + gap)
        _box(s, x, CONTENT_TOP + 0.1, w, 4.9, fill=TINT, name=title)
        _text(s, x + 0.3, CONTENT_TOP + 0.35, w - 0.6, 0.55, title.upper(), 12, True, NAVY)
        _runs(s, x + 0.3, CONTENT_TOP + 1.0, w - 0.6, 1.1, [(str(val), 60, True, col), (f"  {of}", 16, False, MUTED)],
              anchor=MSO_ANCHOR.BOTTOM)
        _text(s, x + 0.3, CONTENT_TOP + 2.3, w - 0.6, 1.6, explain, 15, False, INK)
        if detail:
            _text(s, x + 0.3, CONTENT_TOP + 4.25, w - 0.6, 0.55, detail, 12, False, MUTED)

    def appendix(d: Deck):
        mrows, urows = data.get("materialised_rows") or [], data.get("unlinked_rows") or []
        if mrows:
            sl = d.content_slide("Risks that materialised", f"Appendix · {label}")
            _table(sl, MX, CONTENT_TOP, CONTENT_W, ["Risk", "Category", "Owner", "Control rating", "Linked", "Latest incident"],
                   [[m.get("risk_id"), m.get("category"), m.get("owner") or "Unassigned",
                     f"{m.get('control_rating', '—')}{' · contradicted' if m.get('contradicted') else ''}",
                     m.get("incident_count"),
                     f"{m.get('latest_incident_id', '')} ({m.get('latest_incident_severity') or '—'})"]
                    for m in mrows[:TABLE_ROWS_PER_SLIDE]],
                   [1.1, 2.0, 2.6, 1.9, 0.9, 2.8], size=12,
                   cell_colors={(i, 3): RED for i, m in enumerate(mrows[:TABLE_ROWS_PER_SLIDE]) if m.get("contradicted")})
        if urows:
            sl = d.content_slide("Incidents with no matching risk", f"Appendix · {label}")
            cov = lambda c: "—" if c is None else ("Covered category, not linked" if c else "No covering risk")
            rows = urows[:TABLE_ROWS_PER_SLIDE]
            _table(sl, MX, CONTENT_TOP, CONTENT_W, ["Incident", "Title", "Category", "Severity", "Reported", "Coverage"],
                   [[u.get("incident_id"), u.get("title"), u.get("category"), u.get("severity"),
                     _fmt_date(u.get("reported_at")), cov(u.get("covered"))] for u in rows],
                   [1.6, 3.6, 1.7, 1.1, 1.3, 2.4], size=12,
                   cell_colors={(i, 5): RED for i, u in enumerate(rows) if u.get("covered") is False})
    d.appendix.append((label, appendix))
    return True


def r_methodology(d: Deck, data, ai, label):
    """Methodology is reference material: appendix only, no headline slide."""
    def appendix(d: Deck):
        sl = d.content_slide(label, "Appendix")
        facts = [
            ["Active risks", data.get("active_risks")],
            ["Snapshots held", f"{data.get('snapshot_count', 0)} (trends {'shown' if data.get('allow_trends') else 'suppressed, needs 2'})"],
            ["Percentages", "shown" if data.get("allow_percentages") else "suppressed below 5 risks"],
            ["Incident module", "enabled" if data.get("incidents_enabled") else "not enabled"],
            ["Average residual (supplied / Pulse engine)", f"{data.get('avg_residual')} / {data.get('avg_residual_pulse')}"],
            ["Residuals match the Pulse engine", "Yes" if data.get("residual_matches_engine") else "No"],
            ["Controls with no test date", data.get("controls_untested")],
            ["Ratings with no assertion source", data.get("unasserted")],
        ]
        _table(sl, MX, CONTENT_TOP, 8.0, ["Basis", "Value"], facts, [5.0, 3.0], size=13)
    d.appendix.append((label, appendix))
    return None   # None = handled, no headline slide


RENDERERS: dict[str, Callable] = {
    "executive-dashboard": r_executive_dashboard,
    "exposure-index": r_exposure_index,
    "risk-snapshot": r_risk_snapshot,
    "key-risk-changes": r_key_risk_changes,
    "risk-ownership": r_risk_ownership,
    "ai-exec-summary": r_ai_exec_summary,
    "executive-commentary": r_executive_commentary,
    "exposure-trend": r_exposure_trend,
    "residual-risk-trend": r_residual_risk_trend,
    "risk-distribution": r_risk_distribution,
    "risk-heat-map": r_risk_heat_map,
    "top-risks": r_top_risks,
    "top-emerging-risks": r_top_emerging_risks,
    "incident-stability": r_incident_stability,
    "incident-trend": r_incident_trend,
    "major-incidents": r_major_incidents,
    "incident-analytics": r_incident_analytics,
    "risk-incident-correlation": r_risk_incident_correlation,
    "methodology": r_methodology,
    "findings": r_findings,
    "recommendations": r_recommendations,
    "conclusion": r_conclusion,
}


def _pages(items: list, per: int = TABLE_ROWS_PER_SLIDE):
    """Yield (title suffix, chunk). Suffix is '' or ' (2 of 3)'."""
    chunks = [items[i:i + per] for i in range(0, len(items), per)] or [[]]
    for n, chunk in enumerate(chunks, start=1):
        yield ("" if len(chunks) == 1 else f" ({n} of {len(chunks)})"), chunk


# ═══════════════════════════════════════════════════════════════════════════════
# LOGO
# ═══════════════════════════════════════════════════════════════════════════════

def _prepare_logo(raw: bytes | None) -> tuple[bytes, float] | None:
    """Normalise any raster logo to PNG and return (bytes, aspect ratio).
    SVG and unreadable files return None, so the deck builds without a logo."""
    if not raw:
        return None
    try:
        from PIL import Image as PILImage
        im = PILImage.open(io.BytesIO(raw))
        im.load()
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA")
        if max(im.size) > 1200:
            im.thumbnail((1200, 1200))
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        return buf.getvalue(), im.size[0] / max(1, im.size[1])
    except Exception as exc:
        logger.warning("pptx logo skipped: %s", exc)
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

def build_pptx(
    blocks: list[str],
    block_data: dict,
    ai_data: dict,
    settings_p: dict,
    date_from: str | None = None,
    date_to: str | None = None,
    org_name: str = "",
    logo_bytes: bytes | None = None,
    orientation: str | None = None,   # accepted for parity with build_pdf; slides are 16:9
) -> bytes:
    title = settings_p.get("report_title") or "Risk Report"
    period = " to ".join(filter(None, [_fmt_date(date_from), _fmt_date(date_to)]))
    deck = Deck(org_name, title, settings_p.get("footer_text") or "", period,
                _prepare_logo(logo_bytes), settings_p.get("page_numbering", "Show") != "Hide")
    deck.prs.core_properties.title = title
    deck.prs.core_properties.author = org_name or "SmartRisk Pulse"

    # ── Cover ────────────────────────────────────────────────────────────────
    cover = deck.prs.slides.add_slide(deck.blank)
    bg = cover.background.fill
    bg.solid()
    bg.fore_color.rgb = _rgb(NAVY)
    if deck.logo:
        _box(cover, MX, 0.6, 2.4, 1.0, fill=WHITE, name="Logo panel")
        deck._place_logo(cover, MX + 2.25, 0.72, 2.1, 0.76)
    _text(cover, MX, 2.35, 10.5, 0.4, (org_name or "").upper(), 14, True, TEAL, name="Organisation")
    _text(cover, MX, 2.8, 11.0, 1.6, title, 44, True, WHITE, name="Title")
    meta = [("Period", period), ("Prepared for", settings_p.get("prepared_for")),
            ("Reference", " · ".join(filter(None, [settings_p.get("report_ref"), settings_p.get("version")])))]
    meta = [(k, v) for k, v in meta if v]
    for i, (k, v) in enumerate(meta):
        _text(cover, MX + i * 3.6, 4.75, 3.4, 0.3, k.upper(), 11, True, "94A3B8")
        _text(cover, MX + i * 3.6, 5.05, 3.4, 0.4, v, 15, False, WHITE)
    so = settings_p.get("signoff") or {}
    if so.get("include", True) and (so.get("prepared_by") or so.get("approved_by")):
        parts = []
        if so.get("prepared_by"):
            parts.append("Prepared by " + ", ".join(filter(None, [so.get("prepared_by"), so.get("prepared_title")])))
        if so.get("approved_by"):
            parts.append("Approved by " + ", ".join(filter(None, [so.get("approved_by"), so.get("approved_title")])))
        _text(cover, MX, 6.55, 11.5, 0.35, "   |   ".join(parts), 12, False, "CBD5E1", name="Sign-off")
    _text(cover, SLIDE_W - MX - 3.5, 6.95, 3.5, 0.3, settings_p.get("footer_text") or "", 10, False, "94A3B8",
          align=PP_ALIGN.RIGHT)

    # ── Section slides ───────────────────────────────────────────────────────
    for key in blocks:
        label = LABELS.get(key, key)
        data = block_data.get(key)
        if not isinstance(data, dict) or not data:
            continue
        if data.get("status") == "suppressed":
            deck.omitted.append((label, str(data.get("reason") or "Not available.")))
            continue
        fn = RENDERERS.get(key)
        if fn is None:
            deck.omitted.append((label, "This section is not available in the PowerPoint export yet."))
            continue
        try:
            shown = fn(deck, data, (ai_data or {}).get(key) or None, label)
        except Exception as exc:
            logger.error("PPTX render error [%s]: %s", key, exc, exc_info=True)
            deck.omitted.append((label, "This section could not be rendered. It is included in the PDF."))
            continue
        if shown is False:
            deck.omitted.append((label, "No data for this period."))

    # ── Appendix ─────────────────────────────────────────────────────────────
    if deck.appendix or deck.omitted:
        deck.divider("Appendix", "Detail behind the headline slides")
        for label, build in deck.appendix:
            try:
                build(deck)
            except Exception as exc:
                logger.error("PPTX appendix error [%s]: %s", label, exc, exc_info=True)
        if deck.omitted:
            sl = deck.content_slide("Sections not included", "Appendix")
            _table(sl, MX, CONTENT_TOP, CONTENT_W, ["Section", "Reason"],
                   [[lbl, reason] for lbl, reason in deck.omitted[:TABLE_ROWS_PER_SLIDE]], [3.0, 9.0], size=13)

    buf = io.BytesIO()
    deck.prs.save(buf)
    return buf.getvalue()
