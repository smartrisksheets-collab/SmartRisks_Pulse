"""
backend/tests/test_permissions.py

Verifies that permission and module gating works at the route level.

Analyst token: manage_risks=False, view_only=True, modules=[risk, incident]

- GET /api/v1/risks          -> require_module("risk")        -> Analyst: 200
- GET /api/v1/audit          -> require_permission("manage_risks") -> Analyst: 403
- POST /api/v1/risks         -> require_permission("manage_risks") -> Analyst: 403
- PATCH /api/v1/incidents/x  -> require_permission("manage_incidents") -> Analyst: 403
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_analyst_can_list_risks(
    client: AsyncClient, analyst_headers: dict
) -> None:
    """List risks only requires the risk module, not manage_risks."""
    r = await client.get("/api/v1/risks", headers=analyst_headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_analyst_blocked_from_audit_log(
    client: AsyncClient, analyst_headers: dict
) -> None:
    """GET /audit requires manage_risks; Analyst lacks it."""
    r = await client.get("/api/v1/audit", headers=analyst_headers)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_analyst_blocked_from_create_risk(
    client: AsyncClient, analyst_headers: dict
) -> None:
    """POST /risks requires manage_risks; Analyst lacks it."""
    r = await client.post(
        "/api/v1/risks",
        json={
            "category": "Operational",
            "description": "Should be blocked",
            "owner": "Analyst",
            "treatment": "Accept",
            "likelihood": 1,
            "impact_score": 1,
        },
        headers=analyst_headers,
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_analyst_blocked_from_update_incident(
    client: AsyncClient, analyst_headers: dict
) -> None:
    """PATCH /incidents/{id} requires manage_incidents; Analyst lacks it."""
    r = await client.patch(
        "/api/v1/incidents/NONEXISTENT",
        json={"status": "Closed"},
        headers=analyst_headers,
    )
    # 403 from permission check fires before the 404 from DB lookup
    assert r.status_code == 403
