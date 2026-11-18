"""
Public incident form (Pulse skin): workspace severity levels, short title, cost confidence,
and the incident date and time carried into the incident on approval.
"""

import os
import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.exceptions import ValidationError
from app.models.incident import Incident
from app.schemas.external import ExternalIncidentSubmit
from app.services import external as ext_svc
from app.services.external import _incident_dt
from tests.test_home import _tenant


@pytest_asyncio.fixture
async def session(seed):
    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


async def _levels(s: AsyncSession, tid: uuid.UUID) -> None:
    for i, (label, crit) in enumerate([("Critical", "Service down or a breach"), ("Minor", None)]):
        await s.execute(
            text("INSERT INTO incident_severity_levels (tenant_id, label, sort_order, color, criteria_text) VALUES (:t, :l, :o, '#64748b', :c)"),
            {"t": str(tid), "l": label, "o": i, "c": crit},
        )


def _payload(**kw: str) -> ExternalIncidentSubmit:
    base = {"reported_by": "Ada", "description": "Payroll down", "category": "IT", "severity": "Critical"}
    return ExternalIncidentSubmit(**{**base, **kw})


@pytest.mark.asyncio
async def test_public_severity_uses_workspace_levels(client: AsyncClient, session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await _levels(session, tid)
    await session.commit()
    r = await client.get(f"/api/v1/external/severity/{tid}")
    assert r.status_code == 200
    assert r.json()["data"] == [{"label": "Critical", "help": "Service down or a breach"}, {"label": "Minor", "help": ""}]


@pytest.mark.asyncio
async def test_public_severity_defaults_without_seeding(client: AsyncClient, session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await session.commit()
    r = await client.get(f"/api/v1/external/severity/{tid}")
    assert [lv["label"] for lv in r.json()["data"]] == ["Very High", "High", "Medium", "Low"]
    n = (await session.execute(text("SELECT count(*) FROM incident_severity_levels WHERE tenant_id = :t"), {"t": str(tid)})).scalar()
    assert n == 0  # read-only: a public GET never writes


@pytest.mark.asyncio
async def test_public_severity_unknown_workspace_404(client: AsyncClient) -> None:
    r = await client.get(f"/api/v1/external/severity/{uuid.uuid4()}")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_submit_rejects_unlisted_severity(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await _levels(session, tid)
    with pytest.raises(ValidationError):
        await ext_svc.submit_incident(session, tid, _payload(severity="Medium"))
    await session.rollback()


def test_schema_title_and_confidence() -> None:
    p = _payload(title="  Payroll   down  ", impact_confidence="Estimated")
    assert p.title == "Payroll down"
    assert p.impact_confidence == "Estimated"
    with pytest.raises(Exception, match="impact_confidence"):
        _payload(impact_confidence="Low, a rough guess")
    with pytest.raises(Exception, match="80"):
        _payload(title="x" * 81)


def test_incident_dt_from_date_and_time() -> None:
    assert _incident_dt("2026-11-10", "14:35") == datetime(2026, 11, 10, 14, 35, tzinfo=timezone.utc)
    assert _incident_dt("2026-11-10", "") == datetime(2026, 11, 10, 0, 0, tzinfo=timezone.utc)
    assert _incident_dt("2026-11-10", "99:99") == datetime(2026, 11, 10, 0, 0, tzinfo=timezone.utc)
    assert _incident_dt("", "14:35") is None
    assert _incident_dt("not a date", "") is None
    assert _incident_dt("2999-01-01", "") is None


@pytest.mark.asyncio
async def test_approve_carries_title_confidence_and_time(session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    await _levels(session, tid)
    res = await ext_svc.submit_incident(session, tid, _payload(
        title="Payroll outage", impact_confidence="Confirmed", incident_date="2026-11-10", incident_time="14:35",
    ))
    await ext_svc.approve_submission(session, tid, res.id, "reviewer@example.com")
    await session.commit()
    inc = (await session.execute(select(Incident).where(Incident.tenant_id == tid))).scalar_one()
    assert inc.title == "Payroll outage"
    assert inc.impact_confidence == "Confirmed"
    assert inc.incident_dt == datetime(2026, 11, 10, 14, 35, tzinfo=timezone.utc)
    assert inc.severity == "Critical"
