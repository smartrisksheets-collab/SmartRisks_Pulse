import re
from pydantic import BaseModel, model_validator

HELP_EVENTS: frozenset[str] = frozenset({"no_results", "open", "contact"})
HELP_QUERY_MAX = 200
_ENTRY_ID_RE = re.compile(r"^[a-z0-9-]{1,64}$")


class HelpEntry(BaseModel):
    id:       str
    title:    str
    what:     str
    how:      str | None = None
    where:    str | None = None
    route:    str | None = None
    requires: str | None = None   # permission key, e.g. "manage_settings"
    keywords: list[str]
    group:    str


class HelpEventCreate(BaseModel):
    event:    str
    entry_id: str | None = None
    query:    str | None = None

    @model_validator(mode="after")
    def _check(self) -> "HelpEventCreate":
        if self.event not in HELP_EVENTS:
            raise ValueError("Unknown help event.")
        if self.query is not None:
            self.query = self.query.strip()[:HELP_QUERY_MAX] or None
        if self.event == "open":
            if self.entry_id is None or not _ENTRY_ID_RE.match(self.entry_id):
                raise ValueError("A valid entry_id is required for an open event.")
            self.query = None
        else:
            if self.query is None:
                raise ValueError("A query is required for this event.")
            self.entry_id = None
        return self