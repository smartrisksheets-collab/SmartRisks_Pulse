"""
Gap map batch 3: secrets kept out of the error log, logging with request ids,
crash details recorded, database clashes as 409, raw ValueError text no longer
sent to users, and one error shape for every reply.
"""

import asyncio
import logging
import uuid

import pytest
from fastapi import APIRouter, Request
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.exceptions import ValidationError
from app.core.logging_config import _RequestIdFilter, request_id_var
from app.db.session import AsyncSessionLocal
from app.main import app
from app.middleware import error_log
from app.middleware.error_log import _scrub, error_detail_for

# Test-only routes, mounted once under a path no real route uses.
_PREFIX = "/api/v1/__batch3_test__"
_router = APIRouter()


@_router.post("/value-error")
async def _raise_value_error(request: Request) -> dict:
    raise ValueError("internal detail: column x of table y")


@_router.get("/validation-error")
async def _raise_validation_error() -> dict:
    raise ValidationError("Likelihood must be between 1 and 5.")


@_router.get("/integrity-error")
async def _raise_integrity_error() -> dict:
    raise IntegrityError("INSERT INTO risks ...", {"id": "R-001"}, Exception("duplicate key value"))


if not any(getattr(r, "path", "").startswith(_PREFIX) for r in app.router.routes):
    app.include_router(_router, prefix=_PREFIX)


# ── Item 6: secrets out of the error log ─────────────────────────────────────

def test_scrub_blanks_secrets_at_any_depth() -> None:
    body = {
        "access_token": "ya29.live-google-token",
        "new_pin": "123456",
        "confirm_password": "hunter2!",
        "client_secret": "s",
        "profile": {"name": "Ada", "refresh_token": "r"},
        "rows": [{"description": "private text", "category": "IT"}],
        "category": "Operational",
    }
    out = _scrub(body)
    assert out == {
        "access_token": "[redacted]",
        "new_pin": "[redacted]",
        "confirm_password": "[redacted]",
        "client_secret": "[redacted]",
        "profile": {"name": "Ada", "refresh_token": "[redacted]"},
        "rows": [{"description": "[redacted]", "category": "IT"}],
        "category": "Operational",
    }


def test_error_detail_keeps_only_the_first_line() -> None:
    exc = Exception("duplicate key value\n[SQL: INSERT ...]\n[parameters: ('secret@x.com',)]")
    assert error_detail_for(exc) == "Exception: duplicate key value"
    assert len(error_detail_for(Exception("x" * 1000))) == 300


# ── Items 7 and 12: crashes logged, raw text not sent ────────────────────────

@pytest.mark.asyncio
async def test_plain_value_error_is_a_logged_500_without_its_text(setup_db,
                                                                  caplog: pytest.LogCaptureFixture) -> None:
    marker = uuid.uuid4().hex
    # The shared client re-raises app errors; a real server sends the 500 reply.
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    with caplog.at_level(logging.ERROR, logger="app"):
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            r = await c.post(f"{_PREFIX}/value-error", json={"access_token": "live-token", "marker": marker})
    assert r.status_code == 500
    body = r.json()
    assert body["error"] == "An unexpected error occurred. Please try again."
    assert "column x" not in r.text
    assert r.headers["x-request-id"] == body["meta"]["request_id"]
    assert any("unhandled error" in rec.getMessage() and rec.exc_info for rec in caplog.records)

    # The crash is recorded with its detail, and the token is blanked.
    await asyncio.gather(*list(error_log._PENDING))
    async with AsyncSessionLocal() as s:
        row = (await s.execute(
            text("SELECT status_code, error_detail, request_body FROM api_error_log "
                 "WHERE request_body->>'marker' = :m"), {"m": marker},
        )).one()
    assert row.status_code == 500
    assert row.error_detail == "ValueError: internal detail: column x of table y"
    assert row.request_body["access_token"] == "[redacted]"


@pytest.mark.asyncio
async def test_own_validation_error_still_reaches_the_user(client: AsyncClient) -> None:
    r = await client.get(f"{_PREFIX}/validation-error")
    assert r.status_code == 422
    assert r.json() == {"data": None, "error": "Likelihood must be between 1 and 5.", "meta": {}}


# ── Item 11: database clash ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_integrity_error_is_a_409_the_user_can_act_on(client: AsyncClient) -> None:
    r = await client.get(f"{_PREFIX}/integrity-error")
    assert r.status_code == 409
    assert "already exists or was changed" in r.json()["error"]
    assert "INSERT" not in r.text


# ── Item 13: one error shape ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_unknown_route_uses_the_envelope(client: AsyncClient) -> None:
    r = await client.get("/api/v1/no-such-route")
    assert r.status_code == 404
    assert r.json() == {"data": None, "error": "Not Found", "meta": {}}


@pytest.mark.asyncio
async def test_request_validation_uses_the_envelope_and_hides_input(client: AsyncClient) -> None:
    r = await client.post("/api/v1/auth/login", json={"email": "not-an-email", "password": "MySecret99"})
    assert r.status_code == 422
    body = r.json()
    assert body["data"] is None
    assert body["error"].startswith("email: ")
    assert body["meta"]["detail"][0]["loc"][-1] == "email"
    assert "MySecret99" not in r.text


@pytest.mark.asyncio
async def test_route_http_exception_uses_the_envelope(client: AsyncClient, owner_headers: dict) -> None:
    r = await client.post(f"/api/v1/external/{uuid.uuid4()}/approve", json={"reviewer_notes": ""},
                          headers=owner_headers)
    assert r.status_code == 404
    assert r.json() == {"data": None, "error": "Submission not found or already reviewed", "meta": {}}


# ── Item 7: request ids ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_request_id_is_returned_and_safe_incoming_ids_are_kept(client: AsyncClient) -> None:
    r = await client.get("/api/v1/no-such-route", headers={"X-Request-ID": "render-abc.123"})
    assert r.headers["x-request-id"] == "render-abc.123"
    r = await client.get("/api/v1/no-such-route", headers={"X-Request-ID": "bad id\nwith newline"})
    assert r.headers["x-request-id"] != "bad id\nwith newline"
    assert len(r.headers["x-request-id"]) == 16


def test_log_lines_carry_the_request_id() -> None:
    rec = logging.LogRecord("app", logging.INFO, __file__, 1, "hello", None, None)
    token = request_id_var.set("abc123")
    try:
        _RequestIdFilter().filter(rec)
    finally:
        request_id_var.reset(token)
    assert rec.request_id == "abc123"  # type: ignore[attr-defined]
