"""
Department link form: picking "already happened" points to the workspace's open incident form.
GET /api/v1/submissions/form/{token} returns incident_form_path, or null when incidents are off.
"""

import os
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from tests.test_home import _tenant


@pytest_asyncio.fixture
async def session(seed):
    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


async def _token(s: AsyncSession, tid: uuid.UUID, seed: dict, modules: str) -> str:
    await s.execute(text(f"UPDATE tenants SET modules = ARRAY[{modules}]::text[] WHERE id = :t"), {"t": str(tid)})
    tok = f"tok-{uuid.uuid4().hex}"
    await s.execute(
        text("""
            INSERT INTO submission_tokens (id, workspace_id, token, label, department, issued_by)
            VALUES (:id, :t, :tok, 'Q4', 'Finance', :by)
        """),
        {"id": str(uuid.uuid4()), "t": str(tid), "tok": tok, "by": seed["account_id"]},
    )
    await s.commit()
    return tok


@pytest.mark.asyncio
async def test_incident_path_when_module_on(client: AsyncClient, session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    tok = await _token(session, tid, seed, "'risk','incident'")
    r = await client.get(f"/api/v1/submissions/form/{tok}")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["incident_form_path"] == f"/external/incident?workspace_id={tid}"
    assert data["department"] == "Finance"


@pytest.mark.asyncio
async def test_no_incident_path_when_module_off(client: AsyncClient, session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    tok = await _token(session, tid, seed, "'risk'")
    r = await client.get(f"/api/v1/submissions/form/{tok}")
    assert r.status_code == 200
    assert r.json()["data"]["incident_form_path"] is None


@pytest.mark.asyncio
async def test_revoked_token_still_404(client: AsyncClient, session: AsyncSession, seed: dict) -> None:
    tid = await _tenant(session, seed)
    tok = await _token(session, tid, seed, "'risk','incident'")
    await session.execute(text("UPDATE submission_tokens SET revoked_at = now() WHERE token = :k"), {"k": tok})
    await session.commit()
    r = await client.get(f"/api/v1/submissions/form/{tok}")
    assert r.status_code == 404
