# app/schemas/onboarding.py
"""Setup wizard: the saved draft, the finish call and the options it offers."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.limits import Short, Tiny

MAX_CATEGORIES = 30


class OnboardingData(BaseModel):
    """Answers so far. Every field is optional while the wizard is in progress;
    finish checks that the required ones are filled."""
    workspace_name: Short | None = None
    org_name: Short | None = None
    sector: Tiny | None = None
    categories: list[Short] = Field(default_factory=list, max_length=MAX_CATEGORIES)
    # Threshold per category, 1 to the matrix maximum (checked at finish).
    appetite: dict[Short, int] = Field(default_factory=dict, max_length=MAX_CATEGORIES)
    appetite_skipped: bool = False


class OnboardingDraftSave(BaseModel):
    step: int = Field(..., ge=1, le=3)
    data: OnboardingData


class OnboardingDraftResponse(BaseModel):
    step: int
    data: OnboardingData
    updated_at: datetime


class OnboardingBand(BaseModel):
    label: str
    min: int
    max: int


class OnboardingSuggestion(BaseModel):
    category: str
    threshold: int


class OnboardingOptions(BaseModel):
    sectors: list[str]
    default_categories: list[str]
    min_categories: int
    max_categories: int
    # The default matrix every new workspace starts on.
    matrix_max: int
    bands: list[OnboardingBand]
    # Band number (1 = lowest) for each score from 1 to matrix_max, so the
    # wizard shows "Tolerates up to High" without working it out itself.
    band_for_score: list[int]
    # Where a category with no SmartRisk suggestion starts: the middle of the scale.
    appetite_start: int
    appetite_note: str
    # SmartRisk suggested categories and starting thresholds per sector. Picking a
    # sector pre-fills its categories; step 3 starts each one at its threshold.
    suggestions: dict[str, list[OnboardingSuggestion]] = {}
    guide_url: str = ""


class OnboardingFinishResponse(BaseModel):
    workspace_id: str
    workspace_name: str
    categories: list[str]
    appetite_saved: int
