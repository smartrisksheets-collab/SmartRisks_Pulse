"""
Workspace clock: greeting and date follow the Settings time zone, not the server clock.
"""

import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.tenant import Tenant
from app.services.clock import day_part, greeting, local_now, zone_name
from app.services.home import get_home
from tests.test_home import _tenant


@pytest_asyncio.fixture
async def session(seed):
    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


def _t(tz: str | None, ws: dict | None = None) -> Tenant:
    return Tenant(timezone=tz, workspace_settings=ws or {})


@pytest.mark.parametrize(
    ("hour", "part"),
    [(0, "morning"), (3, "morning"), (4, "morning"), (11, "morning"), (12, "afternoon"),
     (16, "afternoon"), (17, "evening"), (23, "evening")],
)
def test_day_part_bands(hour: int, part: str) -> None:
    assert day_part(hour) == part
    assert greeting(hour) == f"Good {part}"


def test_zone_name_fallbacks() -> None:
    assert zone_name(None) == "UTC"
    assert zone_name(_t(None)) == "UTC"
    assert zone_name(_t("")) == "UTC"
    assert zone_name(_t("  ")) == "UTC"
    assert zone_name(_t("Not/AZone")) == "UTC"
    assert zone_name(_t("WAT (UTC+1)")) == "UTC"
    assert zone_name(_t(None, {"timezone": "Africa/Lagos"})) == "Africa/Lagos"
    assert zone_name(_t("America/Chicago", {"timezone": "Africa/Lagos"})) == "America/Chicago"


def test_partner_case_3am_chicago_is_morning() -> None:
    # 09:13 UTC on 17 Nov 2026 is 03:13 in Chicago (CST, UTC-6) and 10:13 in Lagos.
    now = datetime(2026, 11, 17, 9, 13, tzinfo=timezone.utc)
    local = local_now(_t("America/Chicago"), now)
    assert (local.hour, local.minute) == (3, 13)
    assert day_part(local.hour) == "morning"


def test_local_date_crosses_midnight() -> None:
    # 23:30 UTC on 17 Nov is already 18 Nov in Lagos and still 17 Nov in Chicago.
    now = datetime(2026, 11, 17, 23, 30, tzinfo=timezone.utc)
    assert local_now(_t("Africa/Lagos"), now).date().isoformat() == "2026-11-18"
    assert local_now(_t("America/Chicago"), now).date().isoformat() == "2026-11-17"


def test_dst_change_uses_zone_offset() -> None:
    # Chicago is UTC-5 in July (CDT) and UTC-6 in November (CST).
    summer = local_now(_t("America/Chicago"), datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc))
    assert summer.hour == 7


@pytest.mark.asyncio
async def test_home_returns_workspace_clock(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await session.execute(text("UPDATE tenants SET timezone = 'America/Chicago' WHERE id = :t"), {"t": str(tid)})
    await session.commit()

    home = await get_home(session, tid, None, ["risk", "incident"])
    expected = datetime.now(ZoneInfo("America/Chicago"))
    assert home.timezone == "America/Chicago"
    assert home.local_date is not None
    # Allow for a midnight rollover between the call and this line.
    assert abs((home.local_date - expected.date()).days) <= 1
    assert home.day_part in {"morning", "afternoon", "evening"}


@pytest.mark.asyncio
async def test_home_unset_timezone_falls_back_to_utc(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await session.commit()
    home = await get_home(session, tid, None, ["risk"])
    assert home.timezone == "UTC"
    assert home.local_date is not None


# ── Past-only dates (no future dates on forms) ────────────────────────────────

def test_latest_today_is_utc_plus_14() -> None:
    from app.services.clock import latest_today
    assert latest_today(datetime(2026, 11, 17, 9, 0, tzinfo=timezone.utc)).isoformat() == "2026-11-17"
    assert latest_today(datetime(2026, 11, 17, 10, 0, tzinfo=timezone.utc)).isoformat() == "2026-11-18"


def test_risk_schema_rejects_future_dates() -> None:
    from datetime import date, timedelta

    from pydantic import ValidationError

    from app.schemas.risk import RiskCreate, RiskUpdate
    base = {"category": "Ops", "description": "d", "owner": "o", "treatment": "Mitigate", "likelihood": 2, "impact_score": 2}
    future = datetime.now(timezone.utc).date() + timedelta(days=3)
    with pytest.raises(ValidationError, match="Last tested cannot be in the future"):
        RiskCreate(**base, control_last_tested=future)
    with pytest.raises(ValidationError, match="Date logged cannot be in the future"):
        RiskUpdate(logged_at=future)
    ok = RiskCreate(**base, control_last_tested=datetime.now(timezone.utc).date(), logged_at=datetime.now(timezone.utc).date() - timedelta(days=1))
    assert ok.control_last_tested == datetime.now(timezone.utc).date()
    assert RiskUpdate(control_last_tested=None).control_last_tested is None
    # Target dates stay free to be in the future.
    assert RiskCreate(**base, target_date=future).target_date == future


def test_incident_schema_rejects_future_dates() -> None:
    from datetime import date, timedelta

    from pydantic import ValidationError

    from app.schemas.incident import IncidentCreate, IncidentUpdate
    future = datetime.now(timezone.utc).date() + timedelta(days=3)
    base = {"description": "d", "category": "IT", "reported_by": "r"}
    with pytest.raises(ValidationError, match="The date reported cannot be in the future"):
        IncidentCreate(**base, reported_at=future)
    with pytest.raises(ValidationError, match="The date it happened cannot be in the future"):
        IncidentUpdate(incident_dt=datetime.now(timezone.utc) + timedelta(days=3))
    assert IncidentCreate(**base, reported_at=datetime.now(timezone.utc).date()).reported_at == datetime.now(timezone.utc).date()


def test_external_incident_rejects_future_dates() -> None:
    from datetime import date, timedelta

    from pydantic import ValidationError

    from app.schemas.external import ExternalIncidentSubmit
    future = (datetime.now(timezone.utc).date() + timedelta(days=3)).isoformat()
    base = {"reported_by": "r", "description": "d", "category": "IT"}
    with pytest.raises(ValidationError, match="Dates cannot be in the future"):
        ExternalIncidentSubmit(**base, incident_date=future)
    with pytest.raises(ValidationError, match="Dates cannot be in the future"):
        ExternalIncidentSubmit(**base, date_reported=future)
    # Blank and unreadable values pass through unchanged, as before.
    assert ExternalIncidentSubmit(**base, incident_date="").incident_date == ""
    assert ExternalIncidentSubmit(**base, incident_date="next week").incident_date == "next week"
