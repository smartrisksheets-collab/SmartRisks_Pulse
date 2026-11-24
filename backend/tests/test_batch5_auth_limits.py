"""
Gap map batch 5: logout ends the session and refresh tokens are single use,
report settings need print_reports, request size limits, signing secret
check, and bcrypt's 72-byte limit.
"""

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import pytest
from httpx import AsyncClient
from jose import jwt
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import text

from app.core.config import Settings, settings
from app.core.exceptions import InvalidTokenError
from app.core.security import create_refresh_token, hash_password, verify_password
from app.db.session import AsyncSessionLocal
from app.schemas.auth import RegisterRequest
from app.schemas.lookup import LookupPatch
from app.services import auth as auth_svc
from conftest import _make_token


async def _account() -> tuple[str, str]:
    aid = str(uuid.uuid4())
    email = f"rt-{aid[:8]}@example.com"
    async with AsyncSessionLocal() as s:
        await s.execute(
            text("INSERT INTO accounts (id, email, name, token_version, created_at, updated_at) "
                 "VALUES (:id, :e, 'RT', 1, now(), now())"),
            {"id": aid, "e": email},
        )
        await s.commit()
    return aid, email


async def _refresh(tok: str) -> dict:
    async with AsyncSessionLocal() as s:
        try:
            out = await auth_svc.refresh_access_token(s, tok)
            await s.commit()
            return out
        except Exception:
            await s.rollback()
            raise


async def _version(aid: str) -> int:
    async with AsyncSessionLocal() as s:
        return int(await s.scalar(text("SELECT token_version FROM accounts WHERE id = :id"), {"id": aid}))


async def _age_revocation(tok: str, seconds: int) -> None:
    claims = jwt.get_unverified_claims(tok)
    async with AsyncSessionLocal() as s:
        await s.execute(
            text("UPDATE revoked_refresh_tokens SET revoked_at = now() - make_interval(secs => :s) WHERE jti = :j"),
            {"s": seconds, "j": claims["jti"]},
        )
        await s.commit()


# ── Item 14: refresh tokens and logout ───────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_token_is_single_use_with_a_short_grace(seed: dict) -> None:
    aid, _ = await _account()
    tok = create_refresh_token(aid, 1)
    first = await _refresh(tok)
    assert first["refresh_token"] != tok
    await _refresh(tok)                 # a second tab, seconds later: allowed
    await _age_revocation(tok, 60)
    with pytest.raises(InvalidTokenError, match="session has ended"):
        await _refresh(tok)             # reused a minute later: a copied token
    assert await _version(aid) == 2     # every session of the account is ended
    with pytest.raises(InvalidTokenError):
        await _refresh(first["refresh_token"])


@pytest.mark.asyncio
async def test_logout_revokes_the_refresh_cookie(client: AsyncClient, seed: dict) -> None:
    aid, _ = await _account()
    tok = create_refresh_token(aid, 1)
    r = await client.post("/api/v1/auth/logout", cookies={"refresh_token": tok})
    assert r.status_code == 200
    client.cookies.clear()
    with pytest.raises(InvalidTokenError, match="session has ended"):
        await _refresh(tok)
    assert await _version(aid) == 1     # logout ends only this session


@pytest.mark.asyncio
async def test_logout_without_a_cookie_still_succeeds(client: AsyncClient) -> None:
    client.cookies.clear()
    r = await client.post("/api/v1/auth/logout")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_logout_everywhere_ends_all_refresh_tokens(client: AsyncClient, seed: dict) -> None:
    aid, email = await _account()
    tok = create_refresh_token(aid, 1)
    access = _make_token({"account_id": aid, "email": email, "tenant_id": seed["tenant_id"]},
                         "Owner", {}, ["risk"])
    r = await client.post("/api/v1/auth/logout-all", headers={"Authorization": f"Bearer {access}"})
    assert r.status_code == 200
    client.cookies.clear()
    assert await _version(aid) == 2
    with pytest.raises(InvalidTokenError, match="revoked"):
        await _refresh(tok)


@pytest.mark.asyncio
async def test_tokens_issued_before_this_change_still_refresh_once(seed: dict) -> None:
    aid, _ = await _account()
    legacy = jwt.encode(
        {"sub": aid, "exp": datetime.now(timezone.utc) + timedelta(days=1), "type": "refresh",
         "token_version": 1, "active_tenant_id": None},
        settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM,
    )
    out = await _refresh(legacy)
    assert "jti" in jwt.get_unverified_claims(out["refresh_token"])


# ── Item 15: report settings ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_report_settings_save_needs_print_reports(client: AsyncClient, seed: dict) -> None:
    tok = _make_token(seed, "Analyst", {"print_reports": False}, ["risk", "incident"])
    r = await client.post("/api/v1/reports/settings", json={"settings": {}},
                          headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 403
    assert "print_reports" in r.json()["error"]


# ── Item 16: size limits ─────────────────────────────────────────────────────

def test_schema_limits_reject_oversized_values() -> None:
    with pytest.raises(PydanticValidationError):
        RegisterRequest(name="x" * 201, email="a@example.com", password="Aa1!aaaa")
    with pytest.raises(PydanticValidationError):
        RegisterRequest(name="Ada", email="a@example.com", password="Aa1!" + "a" * 125)
    with pytest.raises(PydanticValidationError):
        LookupPatch(category=["c"] * 501)
    with pytest.raises(PydanticValidationError):
        LookupPatch(incident_category_map={f"k{i}": [] for i in range(501)})
    assert LookupPatch(category=["c"] * 500).category is not None


@pytest.mark.asyncio
async def test_oversized_body_is_refused_before_parsing(client: AsyncClient) -> None:
    big = b'{"x": "' + b"a" * (5 * 1024 * 1024) + b'"}'
    r = await client.post("/api/v1/auth/login", content=big, headers={"Content-Type": "application/json"})
    assert r.status_code == 413
    assert r.json()["error"].startswith("The request is too large")


# ── Item 18: bcrypt 72-byte limit ────────────────────────────────────────────

def test_long_passwords_never_raise_and_match_old_hashes() -> None:
    long_pw = "Aa1!" + "z" * 100                      # 104 bytes
    old_hash = bcrypt.hashpw(long_pw.encode()[:72], bcrypt.gensalt(4)).decode()  # what bcrypt 4 stored
    assert verify_password(long_pw, old_hash) is True
    assert verify_password(long_pw, hash_password(long_pw)) is True


# ── Item 19: signing secrets ─────────────────────────────────────────────────

def _settings(**kw: str) -> Settings:
    base = {"DATABASE_URL": "postgresql://x/y", "JWT_SECRET": "j" * 40, "ADMIN_JWT_SECRET": "a" * 40,
            "APP_ENV": "production"}
    return Settings(**{**base, **kw})  # type: ignore[arg-type]


def test_production_refuses_weak_or_shared_secrets() -> None:
    with pytest.raises(PydanticValidationError, match="JWT_SECRET"):
        _settings(JWT_SECRET="short")
    with pytest.raises(PydanticValidationError, match="JWT_SECRET"):
        _settings(JWT_SECRET="change_this_to_a_long_random_string_minimum_32_chars")
    with pytest.raises(PydanticValidationError, match="ADMIN_JWT_SECRET"):
        _settings(ADMIN_JWT_SECRET="j" * 40)
    assert _settings().APP_ENV == "production"
    assert _settings(JWT_SECRET="short", APP_ENV="staging").APP_ENV == "staging"  # warns only
