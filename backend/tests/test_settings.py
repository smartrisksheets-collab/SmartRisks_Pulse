"""
backend/tests/test_settings.py

Settings read and update. GET /settings uses get_active_tenant (any role).
PATCH /settings also uses get_active_tenant (no additional permission gate
in the route; business logic in service handles role checks if any).
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_settings_returns_200(
    client: AsyncClient, owner_headers: dict
) -> None:
    r = await client.get("/api/v1/settings", headers=owner_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["error"] is None
    assert body["data"] is not None


@pytest.mark.asyncio
async def test_update_settings_returns_200(
    client: AsyncClient, owner_headers: dict
) -> None:
    r = await client.patch(
        "/api/v1/settings",
        json={"name": "CI Updated Workspace"},
        headers=owner_headers,
    )
    assert r.status_code == 200
    assert r.json()["error"] is None
