import pytest
from httpx import AsyncClient

import app.main as main_mod


@pytest.mark.asyncio
async def test_health_checks_database(client: AsyncClient) -> None:
    r = await client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"


@pytest.mark.asyncio
async def test_health_returns_503_when_database_fails(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class _Broken:
        async def __aenter__(self) -> None:
            raise ConnectionError("db down")

        async def __aexit__(self, *args: object) -> None:
            return None

    monkeypatch.setattr(main_mod, "AsyncSessionLocal", lambda: _Broken())
    r = await client.get("/api/health")
    assert r.status_code == 503
    body = r.json()
    assert body["status"] == "error"
    assert body["database"] == "unreachable"
    assert "db down" not in r.text
