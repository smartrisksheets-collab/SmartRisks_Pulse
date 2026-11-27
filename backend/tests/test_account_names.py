"""
backend/tests/test_account_names.py

First and last name (migration 072): the name helper, sign-up with either the
new two fields or the old single name, the Home greeting, and the appetite
audit entries.
"""

import os
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.account import Account
from app.services.account_name import (
    clean_name,
    first_name_of,
    set_account_full_name,
    set_account_name,
    split_full_name,
)
from app.services.home import get_home

_PW = "Str0ng!Pass"


@pytest_asyncio.fixture
async def session(seed):
    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


def _email() -> str:
    return f"names-{uuid.uuid4().hex[:10]}@example.com"


async def _names(s: AsyncSession, email: str) -> tuple[str | None, str | None, str | None]:
    row = (await s.execute(
        text("SELECT first_name, last_name, name FROM accounts WHERE email = :e"), {"e": email}
    )).one()
    return row.first_name, row.last_name, row.name


# ── Helper ───────────────────────────────────────────────────────────────────

def test_clean_and_split() -> None:
    assert clean_name("  Chinedu   Ozulumba  ") == "Chinedu Ozulumba"
    assert split_full_name("Chinedu Ozulumba Okafor") == ("Chinedu", "Ozulumba Okafor")
    assert split_full_name("Chineduozulumba") == ("Chineduozulumba", "")
    assert split_full_name(None) == ("", "")
    assert split_full_name("   ") == ("", "")


def test_set_account_name_keeps_three_columns_in_step() -> None:
    a = Account(email="x@example.com")
    set_account_name(a, " Ada ", "  Obi  Eze ")
    assert (a.first_name, a.last_name, a.name) == ("Ada", "Obi Eze", "Ada Obi Eze")
    set_account_full_name(a, "")
    assert (a.first_name, a.last_name, a.name) == (None, None, None)
    set_account_full_name(a, "Tunde")
    assert (a.first_name, a.last_name, a.name) == ("Tunde", None, "Tunde")


def test_first_name_of_falls_back_to_full_name() -> None:
    assert first_name_of("Ada", "Someone Else") == "Ada"
    assert first_name_of(None, "Test Owner") == "Test"
    assert first_name_of("  ", None) is None


# ── Sign-up ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_with_first_and_last_name(client: AsyncClient, session: AsyncSession) -> None:
    email = _email()
    r = await client.post("/api/v1/auth/register", json={
        "first_name": " Chinedu ", "last_name": "Ozulumba", "email": email, "password": _PW,
    })
    assert r.status_code == 200, r.text
    assert await _names(session, email) == ("Chinedu", "Ozulumba", "Chinedu Ozulumba")


@pytest.mark.asyncio
async def test_register_with_old_single_name_still_works(client: AsyncClient, session: AsyncSession) -> None:
    email = _email()
    r = await client.post("/api/v1/auth/register", json={
        "name": "Ada  Obi Eze", "email": email, "password": _PW,
    })
    assert r.status_code == 200, r.text
    assert await _names(session, email) == ("Ada", "Obi Eze", "Ada Obi Eze")


@pytest.mark.asyncio
async def test_register_needs_last_name_with_first_name(client: AsyncClient) -> None:
    r = await client.post("/api/v1/auth/register", json={
        "first_name": "Chinedu", "last_name": "  ", "email": _email(), "password": _PW,
    })
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_register_needs_a_name(client: AsyncClient) -> None:
    r = await client.post("/api/v1/auth/register", json={"email": _email(), "password": _PW})
    assert r.status_code == 422


# ── Home greeting ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_home_greets_with_first_name_column(session: AsyncSession, seed: dict) -> None:
    acc = uuid.uuid4()
    await session.execute(
        text("""
            INSERT INTO accounts (id, email, name, first_name, last_name, token_version, created_at, updated_at)
            VALUES (:id, :e, 'Mary Jane Watson', 'Mary Jane', 'Watson', 1, now(), now())
        """),
        {"id": str(acc), "e": _email()},
    )
    await session.commit()
    home = await get_home(session, uuid.UUID(seed["tenant_id"]), acc, ["risk", "incident"])
    assert home.first_name == "Mary Jane"


# ── Appetite audit ───────────────────────────────────────────────────────────

async def _audit(s: AsyncSession, tenant_id: str, category: str) -> list[tuple[str, str]]:
    rows = (await s.execute(
        text("""
            SELECT action, summary FROM audit_logs
            WHERE tenant_id = :t AND module = 'Settings' AND record_id = :c AND action LIKE 'APPETITE_%'
            ORDER BY created_at, id
        """),
        {"t": tenant_id, "c": category},
    )).all()
    return [(str(r.action), str(r.summary)) for r in rows]


@pytest.mark.asyncio
async def test_appetite_changes_are_audited(
    client: AsyncClient, owner_headers: dict, session: AsyncSession, seed: dict,
) -> None:
    cat = f"Audit-{uuid.uuid4().hex[:6]}"
    tid = seed["tenant_id"]

    r = await client.put("/api/v1/appetite", headers=owner_headers, json={"category": cat, "threshold": 8})
    assert r.status_code == 200, r.text
    r = await client.put("/api/v1/appetite", headers=owner_headers,
                         json={"category": cat, "threshold": 10, "rationale": "Board approved"})
    assert r.status_code == 200, r.text
    r = await client.delete(f"/api/v1/appetite/{cat}", headers=owner_headers)
    assert r.status_code == 200, r.text
    r = await client.delete(f"/api/v1/appetite/{cat}", headers=owner_headers)
    assert r.status_code == 404

    rows = await _audit(session, tid, cat)
    assert rows == [
        ("APPETITE_SET", f"Appetite for {cat} set to 8"),
        ("APPETITE_UPDATE", f"Appetite for {cat} changed from 8 to 10; rationale updated"),
        ("APPETITE_DELETE", f"Appetite for {cat} removed (was 10)"),
    ]
    who = (await session.execute(
        text("SELECT DISTINCT user_email FROM audit_logs WHERE tenant_id = :t AND record_id = :c"),
        {"t": tid, "c": cat},
    )).scalars().all()
    assert who == [seed["email"]]
