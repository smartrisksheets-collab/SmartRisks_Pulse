"""
Payment receipt PDF generator.

Produces a polished, branded A4 receipt for a single payment record.
"""

import io
from datetime import date, datetime
from html import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
    KeepTogether,
    Image,
)


# ============================================================================
# BRAND
# ============================================================================

NAVY = colors.HexColor("#1F2854")
NAVY_DARK = colors.HexColor("#171E42")
TEAL = colors.HexColor("#01B88E")
TEAL_LIGHT = colors.HexColor("#E9FAF5")

TEXT = colors.HexColor("#172033")
MUTED = colors.HexColor("#667085")
BORDER = colors.HexColor("#E4E7EC")
SURFACE = colors.HexColor("#F8FAFC")
WHITE = colors.white


def _style(name: str, **kwargs) -> ParagraphStyle:
    return ParagraphStyle(name, **kwargs)


def _safe(value) -> str:
    """
    Escape values before inserting them into ReportLab Paragraphs.
    """
    if value is None:
        return "—"

    return escape(str(value))


def _format_amount(currency: str, amount: float) -> str:
    return f"{_safe(currency)} {amount:,.2f}"


def _format_date(value: date | datetime) -> str:
    return value.strftime("%d %B %Y")


def _format_datetime(value: date | datetime) -> str:
    return value.strftime("%d %B %Y, %I:%M %p")


def build_receipt_pdf(
    workspace_name: str,
    payment_id: str,
    amount: float,
    currency: str,
    method: str | None,
    reference: str | None,
    paid_at: date | datetime,
    recorded_by: str | None,
    notes: str | None,
    recipient_email: str,
    logo_bytes: bytes | None = None,
) -> bytes:

    buf = io.BytesIO()

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title="Payment Receipt",
        author="SmartRisk Pulse",
    )

    # =========================================================================
    # STYLES
    # =========================================================================

    s_brand = _style(
        "brand",
        fontName="Helvetica-Bold",
        fontSize=17,
        leading=20,
        textColor=WHITE,
    )

    s_brand_sub = _style(
        "brand_sub",
        fontName="Helvetica",
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#BFC7E5"),
        alignment=TA_RIGHT,
    )

    s_kicker = _style(
        "kicker",
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=TEAL,
        tracking=1.2,
    )

    s_title = _style(
        "title",
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=28,
        textColor=NAVY,
        spaceAfter=3,
    )

    s_receipt_no = _style(
        "receipt_no",
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=MUTED,
        alignment=TA_RIGHT,
    )

    s_amount_label = _style(
        "amount_label",
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=MUTED,
        tracking=0.8,
    )

    s_amount = _style(
        "amount",
        fontName="Helvetica-Bold",
        fontSize=30,
        leading=36,
        textColor=NAVY,
    )

    s_success = _style(
        "success",
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=MUTED,
    )

    s_section = _style(
        "section",
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=NAVY,
        tracking=0.5,
    )

    s_label = _style(
        "label",
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=10,
        textColor=MUTED,
        tracking=0.5,
    )

    s_value = _style(
        "value",
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=TEXT,
    )

    s_note = _style(
        "note",
        fontName="Helvetica",
        fontSize=9,
        leading=14,
        textColor=TEXT,
    )

    s_footer = _style(
        "footer",
        fontName="Helvetica",
        fontSize=7.5,
        leading=11,
        textColor=MUTED,
        alignment=TA_CENTER,
    )

    # =========================================================================
    # DIMENSIONS
    # =========================================================================

    page_width, _ = A4
    usable_width = page_width - doc.leftMargin - doc.rightMargin

    # =========================================================================
    # HEADER
    # =========================================================================

    if logo_bytes:
        logo_img = Image(io.BytesIO(logo_bytes))
        logo_img._restrictSize(38 * mm, 14 * mm)
        left_cell = logo_img
    else:
        left_cell = Paragraph("SmartRisk Pulse", s_brand)

    header = Table(
        [[
            left_cell,
            Paragraph(
                "PAYMENT RECEIPT<br/>OFFICIAL RECORD",
                s_brand_sub,
            ),
        ]],
        colWidths=[
            usable_width * 0.60,
            usable_width * 0.40,
        ],
    )

    header.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), NAVY),
            ("LEFTPADDING", (0, 0), (0, 0), 14),
            ("RIGHTPADDING", (0, 0), (0, 0), 10),
            ("LEFTPADDING", (1, 0), (1, 0), 10),
            ("RIGHTPADDING", (1, 0), (1, 0), 14),
            ("TOPPADDING", (0, 0), (-1, -1), 13),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 13),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ])
    )

    # =========================================================================
    # TITLE ROW
    # =========================================================================

    receipt_no = f"RCP-{str(payment_id)[:8].upper()}"

    title_block = Table(
        [[
            [
                Paragraph("PAYMENT", s_kicker),
                Paragraph("Payment Receipt", s_title),
            ],
            Paragraph(
                f"<b>Receipt No.</b><br/>{_safe(receipt_no)}",
                s_receipt_no,
            ),
        ]],
        colWidths=[
            usable_width * 0.70,
            usable_width * 0.30,
        ],
    )

    title_block.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ])
    )

    # =========================================================================
    # AMOUNT CARD
    # =========================================================================

    amount_card = Table(
        [[
            [
                Paragraph("AMOUNT PAID", s_amount_label),
                Spacer(1, 2 * mm),
                Paragraph(
                    _format_amount(currency, amount),
                    s_amount,
                ),
                Spacer(1, 1 * mm),
                Paragraph(
                    "Payment received successfully",
                    s_success,
                ),
            ]
        ]],
        colWidths=[usable_width],
    )

    amount_card.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), TEAL_LIGHT),
            ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#BDEFE2")),
            ("LEFTPADDING", (0, 0), (-1, -1), 16),
            ("RIGHTPADDING", (0, 0), (-1, -1), 16),
            ("TOPPADDING", (0, 0), (-1, -1), 14),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ])
    )

    # =========================================================================
    # PAYMENT DETAILS
    # =========================================================================

    detail_data = [
        [
            Paragraph("WORKSPACE", s_label),
            Paragraph("PAYMENT DATE", s_label),
        ],
        [
            Paragraph(_safe(workspace_name), s_value),
            Paragraph(_format_date(paid_at), s_value),
        ],
        [
            Paragraph("PAYMENT METHOD", s_label),
            Paragraph("REFERENCE", s_label),
        ],
        [
            Paragraph(_safe(method), s_value),
            Paragraph(_safe(reference), s_value),
        ],
        [
            Paragraph("RECORDED BY", s_label),
            Paragraph("RECEIPT NUMBER", s_label),
        ],
        [
            Paragraph(_safe(recorded_by), s_value),
            Paragraph(_safe(receipt_no), s_value),
        ],
    ]

    details = Table(
        detail_data,
        colWidths=[
            usable_width * 0.50,
            usable_width * 0.50,
        ],
    )

    details.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), WHITE),
            ("BOX", (0, 0), (-1, -1), 0.6, BORDER),

            ("LINEBELOW", (0, 1), (-1, 1), 0.5, BORDER),
            ("LINEBELOW", (0, 3), (-1, 3), 0.5, BORDER),

            ("LINEAFTER", (0, 0), (0, -1), 0.5, BORDER),

            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),

            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ])
    )

    # =========================================================================
    # NOTES
    # =========================================================================

    notes_block = None

    if notes and notes.strip():
        notes_inner = Table(
            [[
                Paragraph("NOTES", s_label),
            ], [
                Paragraph(_safe(notes), s_note),
            ]],
            colWidths=[usable_width],
        )

        notes_inner.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), SURFACE),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ])
        )

        notes_block = notes_inner

    # =========================================================================
    # FOOTER
    # =========================================================================

    generated_date = _format_date(date.today())

    footer = [
        HRFlowable(
            width="100%",
            thickness=0.6,
            color=BORDER,
            spaceBefore=2 * mm,
            spaceAfter=4 * mm,
        ),
        Paragraph(
            "SmartRisk Pulse • Official Payment Receipt",
            s_footer,
        ),
        Spacer(1, 1 * mm),
        Paragraph(
            f"Generated on {generated_date} • Sent to {_safe(recipient_email)}",
            s_footer,
        ),
    ]

    # =========================================================================
    # DOCUMENT
    # =========================================================================

    story = [
        header,

        Spacer(1, 10 * mm),

        title_block,

        Spacer(1, 6 * mm),

        amount_card,

        Spacer(1, 8 * mm),

        Paragraph("PAYMENT DETAILS", s_section),

        Spacer(1, 3 * mm),

        details,
    ]

    if notes_block:
        story.extend([
            Spacer(1, 7 * mm),
            notes_block,
        ])

    story.extend([
        Spacer(1, 14 * mm),
        *footer,
    ])

    doc.build(story)

    buf.seek(0)
    return buf.read()