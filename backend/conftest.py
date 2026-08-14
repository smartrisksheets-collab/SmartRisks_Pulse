"""
backend/conftest.py

Env vars are set before any app import so pydantic_settings picks them up
at load time. AsyncSessionLocal in db/session.py is configured at import
time from settings.DATABASE_URL, so it will point at the test database.
"""

import os
import sys
import uuid
from datetime import timedelta


from pathlib import Path
from dotenv import load_dotenv

# Load .env for local dev. In CI, workflow env vars are already set.
# override=False means CI env vars win over .env values.
load_dotenv(Path(__file__).parent / ".env", override=False)

# Derive test DB URL from the real DATABASE_URL by swapping only the DB name.
# This inherits the correct host, port, and credentials automatically.
_real_url = os.environ.get("DATABASE_URL", "")
if _real_url and "/" in _real_url:
    _test_db_url = _real_url.rsplit("/", 1)[0] + "/test_smartrisk"
else:
    _test_db_url = "postgresql+asyncpg://postgres:postgres@localhost:5433/test_smartrisk"
os.environ["DATABASE_URL"] = _test_db_url

os.environ.setdefault("JWT_SECRET", "ci-test-secret-not-for-production-xkf9p2")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-test")
os.environ.setdefault("RESEND_API_KEY", "re_test")
os.environ.setdefault("RESEND_FROM_EMAIL", "noreply@test.com")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from unittest.mock import AsyncMock, patch

from app.main import app
from app.core.security import create_access_token


@pytest.fixture(autouse=True, scope="session")
def mock_background_ai():
    """
    Prevent _auto_run_ai from firing during tests. It calls the Anthropic API
    with a fake key, fails, and asyncpg tries to cancel the in-flight query.
    That cancellation corrupts the connection for the next DB operation in the
    same test, causing AttributeError: NoneType.send on the subsequent request.
    """
    with patch(
        "app.api.v1.routes.risks._auto_run_ai",
        new=AsyncMock(return_value=None),
    ):
        yield
from app.core.rate_limit import limiter

limiter._storage.reset()

import asyncio

_TEST_DB_URL = os.environ["DATABASE_URL"]
_engine = create_async_engine(_TEST_DB_URL, echo=False)
_Session = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    """
    Single event loop for the entire test session.
    Required on Windows: anyio (used by Starlette middleware) and asyncpg both
    attach Futures to the running loop. Without this, pytest-asyncio creates a
    new loop per test file, causing 'Future attached to a different loop' errors
    on any request that goes through BaseHTTPMiddleware with a DB connection.
    The DeprecationWarning from pytest-asyncio for this override is expected and
    harmless on 0.24.x.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    loop.close()


# ── DB bootstrap ────────────────────────────────────────────────────────────
@pytest_asyncio.fixture(scope="session")
async def setup_db():
    """
    Run Alembic migrations on the test DB instead of create_all().
    create_all() fails with asyncpg because it chokes on ARRAY server_default
    values in CREATE TABLE DDL. Alembic uses raw op.execute() SQL which works.
    Passes os.environ explicitly so the test DATABASE_URL overrides .env.
    """
    import subprocess
    from pathlib import Path

    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=Path(__file__).parent,
        env=os.environ.copy(),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Alembic migrations failed:\n{result.stderr}")

    yield

    async with _engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    await _engine.dispose()


# ── Seed: account + tenant + member ─────────────────────────────────────────
@pytest_asyncio.fixture(scope="session")
async def seed(setup_db) -> dict:
    """
    Insert a test account, tenant, and workspace member once.
    Committed so all subsequent test requests can read this data.
    Passwords are NOT stored locally (Supabase Auth owns them);
    the account row is just an identity record.
    """
    account_id = uuid.uuid4()
    tenant_id = uuid.uuid4()
    member_id = uuid.uuid4()

    async with _Session() as s:
        pw_hash = __import__("bcrypt").hashpw(b"Test1234!", __import__("bcrypt").gensalt()).decode()
        await s.execute(
            text("""
                INSERT INTO accounts (id, email, name, password_hash, token_version, created_at, updated_at)
                VALUES (:id, :email, :name, :pw_hash, 1, now(), now())
                ON CONFLICT (email) DO NOTHING
            """),
            {"id": str(account_id), "email": "owner@example.com", "name": "Test Owner", "pw_hash": pw_hash},
        )
        await s.execute(
            text("""
                INSERT INTO tenants (
                    id, name, industry, plan, trial_start_date,
                    payment_active, max_risks, max_users,
                    modules, currency_symbol, created_by,
                    created_at, updated_at
                ) VALUES (
                    :id, :name, 'Technology', 'TRIAL', CURRENT_DATE,
                    false, 1000, 25,
                    ARRAY['risk','incident'], '$', :created_by,
                    now(), now()
                )
                ON CONFLICT (id) DO NOTHING
            """),
            {"id": str(tenant_id), "name": "Test Workspace", "created_by": str(account_id)},
        )
        await s.execute(
            text("""
                INSERT INTO workspace_members (
                    id, account_id, tenant_id, role, status,
                    permissions, created_at, updated_at
                ) VALUES (
                    :id, :account_id, :tenant_id, 'Owner', 'ACTIVE',
                    :permissions, now(), now()
                )
                ON CONFLICT (account_id, tenant_id) DO NOTHING
            """),
            {
                "id": str(member_id),
                "account_id": str(account_id),
                "tenant_id": str(tenant_id),
                "permissions": '{"manage_risks":true,"manage_incidents":true,"manage_settings":true,"manage_users":true,"manage_reports":true,"print_reports":true,"view_only":false}',
            },
        )
        await s.commit()

    return {
        "account_id": str(account_id),
        "tenant_id": str(tenant_id),
        "email": "owner@example.com",
    }


# ── Token helpers ────────────────────────────────────────────────────────────
def _make_token(seed_data: dict, role: str, permissions: dict, modules: list[str]) -> str:
    return create_access_token(
        {
            "sub": seed_data["account_id"],
            "email": seed_data["email"],
            "name": "Test User",
            "active_tenant_id": seed_data["tenant_id"],
            "role": role,
            "permissions": permissions,
            "modules": modules,
            "plan": "TRIAL",
            "trial_expires_at": "2099-12-31",
            "perm_version": 1,
            "token_version": 1,
        },
        expires_delta=timedelta(hours=1),
    )


_OWNER_PERMS = {
    "manage_risks": True,
    "manage_incidents": True,
    "manage_settings": True,
    "manage_users": True,
    "manage_reports": True,
    "print_reports": True,
    "view_only": False,
}

_ANALYST_PERMS = {
    "manage_risks": False,
    "manage_incidents": False,
    "manage_settings": False,
    "manage_users": False,
    "manage_reports": False,
    "print_reports": True,
    "view_only": True,
}


@pytest.fixture(scope="session")
def owner_token(seed) -> str:
    return _make_token(seed, "Owner", _OWNER_PERMS, ["risk", "incident"])


@pytest.fixture(scope="session")
def analyst_token(seed) -> str:
    return _make_token(seed, "Analyst", _ANALYST_PERMS, ["risk", "incident"])


@pytest.fixture(scope="session")
def owner_headers(owner_token) -> dict:
    return {"Authorization": f"Bearer {owner_token}"}


@pytest.fixture(scope="session")
def analyst_headers(analyst_token) -> dict:
    return {"Authorization": f"Bearer {analyst_token}"}


# ── HTTP client ──────────────────────────────────────────────────────────────
@pytest_asyncio.fixture(scope="session")
async def client(setup_db) -> AsyncClient:
    """
    Session-scoped client. Combined with asyncio_default_fixture_loop_scope=session
    in pytest.ini, one event loop runs for the whole session. This prevents the
    APScheduler from starting and stopping on every test, and prevents the asyncpg
    connection pool from going stale between test files.
    """
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
