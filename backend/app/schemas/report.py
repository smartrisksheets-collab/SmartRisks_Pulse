# app/schemas/report.py

from __future__ import annotations
from datetime import datetime
from uuid import UUID
import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_MAX_CC = 5


# ── Report settings (canvas right panel) ─────────────────────────────────────

class SignoffSettings(BaseModel):
    include:       bool   = True
    prepared_by:   str    = ""
    prepared_title: str   = ""
    approved_by:   str    = ""
    approved_title: str   = ""


class ReportSettingsPayload(BaseModel):
    report_title:   str           = ""
    cover_page:     str           = "Yes"
    footer_text:    str           = "Confidential"
    page_numbering: str           = "Show"
    prepared_for:   str           = ""
    distribution:   str           = ""
    report_ref:     str           = ""
    version:        str           = "v1.0"
    signoff:        SignoffSettings = Field(default_factory=SignoffSettings)


# ── Preview request ───────────────────────────────────────────────────────────

class ReportPreviewRequest(BaseModel):
    blocks:      list[str] = Field(default_factory=list)
    date_from:   str | None = None
    date_to:     str | None = None
    report_type: str        = "risk"


# ── AI narrative request ──────────────────────────────────────────────────────

class AIReportRequest(BaseModel):
    blocks:    list[str]  = Field(default_factory=list)
    date_from: str | None = None
    date_to:   str | None = None


# ── Export request ────────────────────────────────────────────────────────────

class ReportExportRequest(BaseModel):
    blocks:      list[str]
    block_data:  dict[str, object]
    ai_data:     dict[str, str]     = Field(default_factory=dict)
    settings:    ReportSettingsPayload = Field(default_factory=ReportSettingsPayload)
    date_from:   str | None = None
    date_to:     str | None = None
    orientation: str        = "portrait"
    format:      Literal["pdf", "pptx"] = "pdf"


# ── Email request ─────────────────────────────────────────────────────────────

class ReportEmailRequest(BaseModel):
    blocks:      list[str]
    block_data:  dict[str, object]
    ai_data:     dict[str, str]     = Field(default_factory=dict)
    settings:    ReportSettingsPayload = Field(default_factory=ReportSettingsPayload)
    date_from:   str | None = None
    date_to:     str | None = None
    to:          str
    cc:          list[str] = Field(default_factory=list)
    subject:     str = "SmartRisk Report"

    @field_validator("cc")
    @classmethod
    def _check_cc(cls, v: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(e.strip().lower() for e in v if e.strip()))
        if len(cleaned) > _MAX_CC:
            raise ValueError(f"CC is limited to {_MAX_CC} addresses.")
        bad = next((e for e in cleaned if not _EMAIL_RE.match(e)), None)
        if bad is not None:
            raise ValueError(f"Invalid CC address: {bad}")
        return cleaned


# ── Template CRUD ─────────────────────────────────────────────────────────────

class TemplateSaveRequest(BaseModel):
    name:        str
    description: str        = ""
    report_type: str        = ""
    blocks:      list[str]
    settings:    dict[str, object] = Field(default_factory=dict)


class TemplateOut(BaseModel):
    template_id: UUID
    name:        str
    description: str
    report_type: str
    blocks:      list[str]
    settings:    dict[str, object]
    is_default:  bool
    created_by:  str
    updated_at:  datetime

    class Config:
        from_attributes = True


# ── Report settings persistence ───────────────────────────────────────────────

class ReportSettingsSaveRequest(BaseModel):
    settings: ReportSettingsPayload


# ── Report Builder draft (UI step 7, migration 065) ───────────────────────────

_MAX_DRAFT_BLOCKS = 40
_MAX_AI_TEXT = 20000
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class DraftPeriod(BaseModel):
    preset:    str        = Field(default="last_30", max_length=40)
    date_from: str | None = None
    date_to:   str | None = None

    @field_validator("date_from", "date_to")
    @classmethod
    def _iso_date(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        if not _ISO_DATE_RE.match(v):
            raise ValueError("Dates must be YYYY-MM-DD.")
        return v


class ReportDraftPayload(BaseModel):
    blocks:      list[str]             = Field(default_factory=list, max_length=_MAX_DRAFT_BLOCKS)
    settings:    ReportSettingsPayload = Field(default_factory=ReportSettingsPayload)
    ai_data:     dict[str, str]        = Field(default_factory=dict)
    ai_reviewed: list[str]             = Field(default_factory=list, max_length=_MAX_DRAFT_BLOCKS)
    period:      DraftPeriod           = Field(default_factory=DraftPeriod)
    template:    str                   = Field(default="", max_length=120)

    @field_validator("ai_data")
    @classmethod
    def _check_ai(cls, v: dict[str, str]) -> dict[str, str]:
        if len(v) > _MAX_DRAFT_BLOCKS:
            raise ValueError(f"A draft holds AI text for at most {_MAX_DRAFT_BLOCKS} sections.")
        if any(len(t) > _MAX_AI_TEXT for t in v.values()):
            raise ValueError(f"AI text is limited to {_MAX_AI_TEXT} characters per section.")
        return v


class ReportDraftSaveRequest(BaseModel):
    draft: ReportDraftPayload
