"""
Workspace clock: the local time of a workspace and the part of the day it falls in.

Every greeting (Home, the brief email) reads the time through this module, so the
workspace time zone set in Settings drives them all the same way.
"""

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.models.tenant import Tenant

DEFAULT_ZONE = "UTC"


def zone_name(tenant: Tenant | None) -> str:
    """The workspace's IANA time zone. Blank or unknown names fall back to UTC."""
    if tenant is None:
        return DEFAULT_ZONE
    ws: dict = dict(tenant.workspace_settings or {})  # type: ignore[arg-type]
    raw = str(tenant.timezone) if tenant.timezone is not None else str(ws.get("timezone") or "")
    name = raw.strip()
    if not name:
        return DEFAULT_ZONE
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return DEFAULT_ZONE
    return name


def local_now(tenant: Tenant | None, now: datetime | None = None) -> datetime:
    """The current time in the workspace's zone. now must be timezone-aware when given."""
    base = now if now is not None else datetime.now(timezone.utc)
    return base.astimezone(ZoneInfo(zone_name(tenant)))


def day_part(hour: int) -> str:
    """Morning from midnight to 11:59, afternoon to 16:59, evening to 23:59."""
    if hour < 12:
        return "morning"
    if hour < 17:
        return "afternoon"
    return "evening"


def greeting(hour: int) -> str:
    return f"Good {day_part(hour)}"


# The furthest-ahead time zone is UTC+14. A date after "today" there is in the
# future for everyone, so the check never rejects a genuine "today" from any zone.
_LATEST_OFFSET = timedelta(hours=14)


def latest_today(now: datetime | None = None) -> date:
    base = now if now is not None else datetime.now(timezone.utc)
    return (base.astimezone(timezone.utc) + _LATEST_OFFSET).date()


def ensure_not_future(v: date | datetime | None, label: str) -> date | datetime | None:
    """Raise ValueError when a past-only date (last tested, date logged, date reported) is in the future."""
    if v is None:
        return None
    d = v.date() if isinstance(v, datetime) else v
    if d > latest_today():
        raise ValueError(f"{label} cannot be in the future")
    return v
