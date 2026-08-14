"""
backend/tests/test_risks.py

Risk CRUD using a pre-crafted Owner JWT.
MatrixConfig is auto-created by _get_or_create on first risk write.
"""

import pytest
from httpx import AsyncClient

_RISK_CREATE = {
    "category": "Operational",
    "description": "Test risk for CI validation suite",
    "owner": "Test Owner",
    "treatment": "Mitigate",
    "likelihood": 3,
    "impact_score": 3,
}


@pytest.mark.asyncio
async def test_list_risks_returns_200(client: AsyncClient, owner_headers: dict) -> None:
    r = await client.get("/api/v1/risks", headers=owner_headers)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["data"], list)
    assert "total" in body["meta"]


@pytest.mark.asyncio
async def test_create_risk_returns_200(
    client: AsyncClient, owner_headers: dict
) -> None:
    r = await client.post("/api/v1/risks", json=_RISK_CREATE, headers=owner_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["category"] == "Operational"
    assert data["id"] is not None


@pytest.mark.asyncio
async def test_update_risk(client: AsyncClient, owner_headers: dict) -> None:
    # Create first
    r = await client.post("/api/v1/risks", json=_RISK_CREATE, headers=owner_headers)
    assert r.status_code == 200
    risk_id = r.json()["data"]["id"]

    # Update description
    r = await client.patch(
        f"/api/v1/risks/{risk_id}",
        json={"description": "Updated by CI test"},
        headers=owner_headers,
    )
    assert r.status_code == 200
    assert r.json()["data"]["description"] == "Updated by CI test"


@pytest.mark.asyncio
async def test_soft_delete_risk(client: AsyncClient, owner_headers: dict) -> None:
    # Create, then delete
    r = await client.post("/api/v1/risks", json=_RISK_CREATE, headers=owner_headers)
    assert r.status_code == 200
    risk_id = r.json()["data"]["id"]

    r = await client.delete(f"/api/v1/risks/{risk_id}", headers=owner_headers)
    assert r.status_code == 200

    # Risk no longer appears in list (deleted_at is set)
    r = await client.get(
        "/api/v1/risks",
        params={"risk_id": risk_id},
        headers=owner_headers,
    )
    assert r.status_code == 200
    assert all(item["id"] != risk_id for item in r.json()["data"])


@pytest.mark.asyncio
async def test_risk_stats_returns_200(client: AsyncClient, owner_headers: dict) -> None:
    r = await client.get("/api/v1/risks/stats", headers=owner_headers)
    assert r.status_code == 200
    assert r.json()["error"] is None
