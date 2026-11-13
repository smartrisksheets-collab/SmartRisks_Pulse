"""Response shape for GET /api/v1/home: everything the Home page shows."""

from pydantic import BaseModel, Field

from app.schemas.dashboard import (
    ActivityEntry,
    IncidentFeedEntry,
    RecommendedAction,
    UnifiedBriefResponse,
)


class HomeTile(BaseModel):
    value: float | None = None
    status: str | None = None
    note: str = ""


class HomeTiles(BaseModel):
    health: HomeTile = Field(default_factory=HomeTile)
    outside_appetite: HomeTile = Field(default_factory=HomeTile)
    open_incidents: HomeTile = Field(default_factory=HomeTile)
    open_high: int = 0
    open_actions: HomeTile = Field(default_factory=HomeTile)


class HomeAction(RecommendedAction):
    # risk | risks | incident | incidents | category | none
    target_kind: str = "none"


class HomeRiskRow(BaseModel):
    id: str
    title: str | None = None
    level: str | None = None
    residual: float | None = None
    tags: list[str] = Field(default_factory=list)


class HomeIncidentRow(BaseModel):
    id: str
    title: str | None = None
    severity: str | None = None
    status: str | None = None
    tags: list[str] = Field(default_factory=list)


class HomeFocus(BaseModel):
    kind: str = ""
    id: str = ""


class HomeSetup(BaseModel):
    appetite: bool = False
    risks: bool = False
    incidents: bool = False
    team: bool = False
    # True while the workspace has no risks and no incidents: Home shows the setup view.
    first_run: bool = True


class HomeResponse(BaseModel):
    first_name: str | None = None
    workspace: str = ""
    status: str = ""
    confidence: str = ""
    verdict: str = ""
    focus: HomeFocus | None = None
    tiles: HomeTiles = Field(default_factory=HomeTiles)
    actions: list[HomeAction] = Field(default_factory=list)
    actions_total: int = 0
    top_risks: list[HomeRiskRow] = Field(default_factory=list)
    open_incidents: list[HomeIncidentRow] = Field(default_factory=list)
    activity_feed: list[ActivityEntry] = Field(default_factory=list)
    incident_feed: list[IncidentFeedEntry] = Field(default_factory=list)
    brief: UnifiedBriefResponse | None = None
    setup: HomeSetup = Field(default_factory=HomeSetup)
