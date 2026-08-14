"""
backend/tests/test_incidents.py

Incident CRUD using a pre-crafted Owner JWT.
"""

import pytest
from httpx import AsyncClient

_INC_CREATE = {
    "description": "Test incident for CI validation suite, min ten chars",
    "category": "IT",
    "reported_by": "CI Runner",
    "severity": "Medium",
    "reported_at": "2026-08-14",
}


@pytest.mark.asyncio
async def test_list_incidents_returns_200(
    client: AsyncClient, owner_headers: dict
) -> None:
    r = await client.get("/api/v1/incidents", headers=owner_headers)
    assert r.status_code == 200
    assert isinstance(r.json()["data"], list)


@pytest.mark.asyncio
async def test_create_incident_returns_200(
    client: AsyncClient, owner_headers: dict
) -> None:
    r = await client.post("/api/v1/incidents", json=_INC_CREATE, headers=owner_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["id"] is not None
    assert data["category"] == "IT"


@pytest.mark.asyncio
async def test_update_incident(client: AsyncClient, owner_headers: dict) -> None:
    r = await client.post("/api/v1/incidents", json=_INC_CREATE, headers=owner_headers)
    assert r.status_code == 200
    inc_id = r.json()["data"]["id"]

    r = await client.patch(
        f"/api/v1/incidents/{inc_id}",
        json={"status": "In Progress"},
        headers=owner_headers,
    )
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "In Progress"


@pytest.mark.asyncio
async def test_soft_delete_incident(client: AsyncClient, owner_headers: dict) -> None:
    r = await client.post("/api/v1/incidents", json=_INC_CREATE, headers=owner_headers)
    assert r.status_code == 200
    inc_id = r.json()["data"]["id"]

    r = await client.delete(f"/api/v1/incidents/{inc_id}", headers=owner_headers)
    assert r.status_code == 200
    assert r.json()["error"] is None
