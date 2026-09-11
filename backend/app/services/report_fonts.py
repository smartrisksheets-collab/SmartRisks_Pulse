# app/services/report_fonts.py
"""
Font registration for ReportLab PDF generation.

Plus Jakarta Sans is the primary brand font.
Fonts are bundled at app/static/fonts/plus-jakarta-sans/ and must
be committed to the repository. They are never downloaded at runtime.

Call register_fonts() once at application startup (lifespan).
build_pdf() also calls it as a safety net (idempotent).
"""
from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Resolve relative to this file: app/services/ → app/ → static/fonts/plus-jakarta-sans/
_FONT_DIR = (
    Path(__file__).resolve().parent.parent
    / "static"
    / "fonts"
    / "plus-jakarta-sans"
)

_FONT_FILES: dict[str, str] = {
    "Jakarta-Regular":  "PlusJakartaSans-Regular.ttf",
    "Jakarta-Medium":   "PlusJakartaSans-Medium.ttf",
    "Jakarta-SemiBold": "PlusJakartaSans-SemiBold.ttf",
    "Jakarta-Bold":     "PlusJakartaSans-Bold.ttf",
}

_REGISTERED:      bool = False
_FONTS_AVAILABLE: bool = False


def register_fonts() -> bool:
    """
    Register Plus Jakarta Sans with ReportLab.
    Returns True on success, False when falling back to Helvetica.
    Safe to call multiple times — registration runs only once.
    """
    global _REGISTERED, _FONTS_AVAILABLE

    if _REGISTERED:
        return _FONTS_AVAILABLE

    _REGISTERED = True

    missing = [
        name for name, fname in _FONT_FILES.items()
        if not (_FONT_DIR / fname).exists()
    ]

    if missing:
        logger.warning(
            "Plus Jakarta Sans not found. Expected directory: %s. "
            "Missing weights: %s. "
            "PDF generation will fall back to Helvetica. "
            "Place the .ttf files at the path above to enable the brand font.",
            _FONT_DIR,
            ", ".join(missing),
        )
        _FONTS_AVAILABLE = False
        return False

    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        for name, fname in _FONT_FILES.items():
            pdfmetrics.registerFont(TTFont(name, str(_FONT_DIR / fname)))

        logger.info(
            "Plus Jakarta Sans registered successfully. Source: %s", _FONT_DIR
        )
        _FONTS_AVAILABLE = True
        return True

    except Exception as exc:
        logger.error(
            "Font registration failed: %s. PDF will use Helvetica fallback.", exc
        )
        _FONTS_AVAILABLE = False
        return False


def font_available() -> bool:
    """True when Jakarta fonts are registered and safe to use."""
    return _FONTS_AVAILABLE


# ── Resolved font name helpers ─────────────────────────────────────────────────
# Call these after register_fonts() has run.
# Typography hierarchy:
#   f_regular()  → body text, descriptions, supporting information
#   f_medium()   → labels, metadata, secondary text
#   f_semibold() → section headings, card titles, table headers
#   f_bold()     → KPI numbers, major metrics, important emphasis

def f_regular()  -> str: return "Jakarta-Regular"  if _FONTS_AVAILABLE else "Helvetica"
def f_medium()   -> str: return "Jakarta-Medium"   if _FONTS_AVAILABLE else "Helvetica"
def f_semibold() -> str: return "Jakarta-SemiBold" if _FONTS_AVAILABLE else "Helvetica-Bold"
def f_bold()     -> str: return "Jakarta-Bold"     if _FONTS_AVAILABLE else "Helvetica-Bold"