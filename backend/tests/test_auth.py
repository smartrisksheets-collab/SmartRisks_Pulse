"""
backend/tests/test_auth.py

Login/register are Supabase-Auth-dependent and cannot be tested in CI
without a live Supabase instance. These tests verify:
  - The health endpoint is reachable
  - Missing Authorization header returns 403 (FastAPI HTTPBearer default)
  - An invalid JWT in the Authorization header returns 401
    (InvalidTokenError raised by get_current_account, mapped to 401)
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health(client: AsyncClient) -> None:
    r = await client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"


@pytest.mark.asyncio
async def test_login_returns_token(client: AsyncClient, seed: dict) -> None:
    """End-to-end login now works without Supabase."""
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": seed["email"], "password": "Test1234!"},
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert "access_token" in data
    assert data["access_token"] != ""


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(client: AsyncClient, seed: dict) -> None:
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": seed["email"], "password": "WrongPassword!"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_missing_token_returns_403(client: AsyncClient) -> None:
    """No Authorization header -> HTTPBearer raises 403 before our code runs."""
    r = await client.get("/api/v1/risks")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_invalid_token_returns_401(client: AsyncClient) -> None:
    """Garbage JWT -> decode_token returns {} -> InvalidTokenError -> 401."""
    r = await client.get(
        "/api/v1/risks",
        headers={"Authorization": "Bearer not.a.real.jwt"},
    )
    assert r.status_code == 401
    assert r.json()["error"] is not None
