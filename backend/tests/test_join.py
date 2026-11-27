"""
backend/tests/test_join.py

Join by email domain (batch 5): the Admin switch (own work domain only, never a
personal one), what a newcomer sees, asking to join, approve and decline, the
user limit, and that one workspace can't act on another's requests.
"""

import os
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from conftest import _ANALYST_PERMS, _OWNER_PERMS, _make_token
from app.core.security import create_access_token
from app.services.join import domain_of, is_allowed_domain


@pytest_asyncio.fixture
async def session(seed):
    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


async def _account(s: AsyncSession, email: str, name: str = "New Person") -> str:
    acc = str(uuid.uuid4())
    await s.execute(text("""
        INSERT INTO accounts (id, email, name, token_version, created_at, updated_at)
        VALUES (:id, :e, :n, 1, now(), now())
    """), {"id": acc, "e": email, "n": name})
    await s.commit()
    return acc


async def _workspace(s: AsyncSession, domain: str, max_users: int = 25) -> dict:
    """A workspace with its own Admin at the given domain."""
    admin_email = f"admin-{uuid.uuid4().hex[:6]}@{domain}"
    admin = await _account(s, admin_email, "Ada Admin")
    tid = str(uuid.uuid4())
    await s.execute(text("""
        INSERT INTO tenants (id, name, plan, max_users, modules, currency_symbol, created_by, created_at, updated_at)
        VALUES (:id, :n, 'TRIAL', :mx, ARRAY['risk'], '$', :by, now(), now())
    """), {"id": tid, "n": f"WS {tid[:6]}", "mx": max_users, "by": admin})
    await s.execute(text("""
        INSERT INTO workspace_members (id, account_id, tenant_id, role, status, created_at, updated_at)
        VALUES (gen_random_uuid(), :a, :t, 'Owner', 'ACTIVE', now(), now())
    """), {"a": admin, "t": tid})
    await s.commit()
    seed = {"account_id": admin, "email": admin_email, "tenant_id": tid}
    return {
        "tenant_id": tid,
        "admin": {"Authorization": "Bearer " + _make_token(seed, "Owner", _OWNER_PERMS, ["risk"])},
        "analyst": {"Authorization": "Bearer " + _make_token(seed, "Analyst", _ANALYST_PERMS, ["risk"])},
    }


def _newcomer_headers(acc: str, email: str) -> dict:
    return {"Authorization": "Bearer " + create_access_token({"sub": acc, "email": email, "workspaces": []})}


def _domain() -> str:
    return f"acme{uuid.uuid4().hex[:8]}.com"


def test_domain_rules() -> None:
    assert domain_of(" Ada@AcmeBank.COM ") == "acmebank.com"
    assert domain_of("no-at-sign") == ""
    assert is_allowed_domain("acmebank.com")
    assert not is_allowed_domain("gmail.com")
    assert not is_allowed_domain("yahoo.com")
    assert not is_allowed_domain("localhost")
    assert not is_allowed_domain("")


@pytest.mark.asyncio
async def test_switch_uses_admins_own_domain_and_is_off_by_default(client: AsyncClient, session: AsyncSession) -> None:
    d = _domain()
    ws = await _workspace(session, d)
    r = await client.get("/api/v1/join/domain", headers=ws["admin"])
    assert r.status_code == 200, r.text
    assert r.json()["data"] == {"enabled": False, "domain": None, "your_domain": d, "allowed": True}

    r = await client.put("/api/v1/join/domain", headers=ws["admin"], json={"enabled": True})
    assert r.json()["data"]["enabled"] is True and r.json()["data"]["domain"] == d
    audit = (await session.execute(text(
        "SELECT action FROM audit_logs WHERE tenant_id = :t ORDER BY created_at"), {"t": ws["tenant_id"]})).scalars().all()
    assert audit == ["JOIN_DOMAIN_ON"]

    r = await client.put("/api/v1/join/domain", headers=ws["admin"], json={"enabled": False})
    assert r.json()["data"]["enabled"] is False


@pytest.mark.asyncio
async def test_personal_domain_cannot_be_switched_on(client: AsyncClient, session: AsyncSession) -> None:
    ws = await _workspace(session, "gmail.com")
    r = await client.get("/api/v1/join/domain", headers=ws["admin"])
    assert r.json()["data"]["allowed"] is False
    r = await client.put("/api/v1/join/domain", headers=ws["admin"], json={"enabled": True})
    assert r.status_code == 422 and "work email" in r.text


@pytest.mark.asyncio
async def test_only_admins_manage_it(client: AsyncClient, session: AsyncSession) -> None:
    ws = await _workspace(session, _domain())
    assert (await client.get("/api/v1/join/domain", headers=ws["analyst"])).status_code == 403
    assert (await client.get("/api/v1/join/requests", headers=ws["analyst"])).status_code == 403


@pytest.mark.asyncio
async def test_ask_approve_flow(client: AsyncClient, session: AsyncSession) -> None:
    d = _domain()
    ws = await _workspace(session, d)
    email = f"Chinedu@{d.upper()}"
    acc = await _account(session, email.lower(), "Chinedu Ozulumba")
    me = _newcomer_headers(acc, email)

    # Off: nothing to join.
    assert (await client.get("/api/v1/join/workspaces", headers=me)).json()["data"] == []

    await client.put("/api/v1/join/domain", headers=ws["admin"], json={"enabled": True})
    rows = (await client.get("/api/v1/join/workspaces", headers=me)).json()["data"]
    assert [(x["tenant_id"], x["request_status"]) for x in rows] == [(ws["tenant_id"], "NONE")]

    r = await client.post(f"/api/v1/join/workspaces/{ws['tenant_id']}", headers=me)
    assert r.status_code == 200 and r.json()["data"]["request_status"] == "PENDING"
    r = await client.post(f"/api/v1/join/workspaces/{ws['tenant_id']}", headers=me)  # second click
    assert r.status_code == 200
    reqs = (await client.get("/api/v1/join/requests", headers=ws["admin"])).json()["data"]
    assert len(reqs) == 1 and reqs[0]["email"] == email.lower()

    r = await client.post(f"/api/v1/join/requests/{reqs[0]['id']}/approve", headers=ws["admin"], json={})
    assert r.status_code == 200, r.text
    role = (await session.execute(text(
        "SELECT role FROM workspace_members WHERE account_id = :a AND tenant_id = :t"),
        {"a": acc, "t": ws["tenant_id"]})).scalar_one()
    assert role == "Analyst"  # the workspace default, never Admin

    # Now a member: shown as approved so setup can open it, request list empty,
    # asking again changes nothing, second approve refused.
    rows = (await client.get("/api/v1/join/workspaces", headers=me)).json()["data"]
    assert [x["request_status"] for x in rows] == ["APPROVED"]
    r = await client.post(f"/api/v1/join/workspaces/{ws['tenant_id']}", headers=me)
    assert r.json()["data"]["request_status"] == "APPROVED"
    assert (await client.get("/api/v1/join/requests", headers=ws["admin"])).json()["data"] == []
    r = await client.post(f"/api/v1/join/requests/{reqs[0]['id']}/approve", headers=ws["admin"])
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_approve_with_role_and_decline(client: AsyncClient, session: AsyncSession) -> None:
    d = _domain()
    ws = await _workspace(session, d)
    await client.put("/api/v1/join/domain", headers=ws["admin"], json={"enabled": True})
    a1 = await _account(session, f"one@{d}")
    a2 = await _account(session, f"two@{d}")
    await client.post(f"/api/v1/join/workspaces/{ws['tenant_id']}", headers=_newcomer_headers(a1, f"one@{d}"))
    await client.post(f"/api/v1/join/workspaces/{ws['tenant_id']}", headers=_newcomer_headers(a2, f"two@{d}"))
    reqs = {x["email"]: x["id"] for x in (await client.get("/api/v1/join/requests", headers=ws["admin"])).json()["data"]}

    r = await client.post(f"/api/v1/join/requests/{reqs[f'one@{d}']}/approve", headers=ws["admin"], json={"role": "Manager"})
    assert r.status_code == 200
    r = await client.post(f"/api/v1/join/requests/{reqs[f'one@{d}']}/approve", headers=ws["admin"], json={"role": "Owner"})
    assert r.status_code == 422  # Admin is never given through a join request

    r = await client.post(f"/api/v1/join/requests/{reqs[f'two@{d}']}/decline", headers=ws["admin"])
    assert r.status_code == 200
    rows = (await client.get("/api/v1/join/workspaces", headers=_newcomer_headers(a2, f"two@{d}"))).json()["data"]
    assert rows[0]["request_status"] == "DECLINED"
    r = await client.post(f"/api/v1/join/workspaces/{ws['tenant_id']}", headers=_newcomer_headers(a2, f"two@{d}"))
    assert r.status_code == 409 and "declined" in r.text

    roles = dict((await session.execute(text("""
        SELECT a.email, m.role FROM workspace_members m JOIN accounts a ON a.id = m.account_id
        WHERE m.tenant_id = :t"""), {"t": ws["tenant_id"]})).all())
    assert roles.get(f"one@{d}") == "Manager" and f"two@{d}" not in roles
    actions = set((await session.execute(text(
        "SELECT action FROM audit_logs WHERE tenant_id = :t"), {"t": ws["tenant_id"]})).scalars().all())
    assert {"JOIN_REQUEST", "JOIN_APPROVE", "JOIN_DECLINE"} <= actions


@pytest.mark.asyncio
async def test_other_domains_and_workspaces_are_kept_apart(client: AsyncClient, session: AsyncSession) -> None:
    d = _domain()
    ws = await _workspace(session, d)
    other = await _workspace(session, _domain())
    await client.put("/api/v1/join/domain", headers=ws["admin"], json={"enabled": True})

    stranger = await _account(session, "x@elsewhere-co.com")
    sh = _newcomer_headers(stranger, "x@elsewhere-co.com")
    assert (await client.get("/api/v1/join/workspaces", headers=sh)).json()["data"] == []
    r = await client.post(f"/api/v1/join/workspaces/{ws['tenant_id']}", headers=sh)
    assert r.status_code == 404

    acc = await _account(session, f"me@{d}")
    await client.post(f"/api/v1/join/workspaces/{ws['tenant_id']}", headers=_newcomer_headers(acc, f"me@{d}"))
    req_id = (await client.get("/api/v1/join/requests", headers=ws["admin"])).json()["data"][0]["id"]
    # Another workspace's Admin can't see or answer it.
    assert (await client.get("/api/v1/join/requests", headers=other["admin"])).json()["data"] == []
    assert (await client.post(f"/api/v1/join/requests/{req_id}/approve", headers=other["admin"])).status_code == 404


@pytest.mark.asyncio
async def test_user_limit_applies(client: AsyncClient, session: AsyncSession) -> None:
    d = _domain()
    ws = await _workspace(session, d, max_users=1)  # the Admin fills it
    await client.put("/api/v1/join/domain", headers=ws["admin"], json={"enabled": True})
    acc = await _account(session, f"late@{d}")
    await client.post(f"/api/v1/join/workspaces/{ws['tenant_id']}", headers=_newcomer_headers(acc, f"late@{d}"))
    req_id = (await client.get("/api/v1/join/requests", headers=ws["admin"])).json()["data"][0]["id"]
    r = await client.post(f"/api/v1/join/requests/{req_id}/approve", headers=ws["admin"])
    assert r.status_code == 429 and "User limit" in r.text
    # Still pending, so it can be approved once a seat is free.
    assert len((await client.get("/api/v1/join/requests", headers=ws["admin"])).json()["data"]) == 1


@pytest.mark.asyncio
async def test_users_list_carries_photo(client: AsyncClient, owner_headers: dict) -> None:
    r = await client.get("/api/v1/users", headers=owner_headers)
    assert r.status_code == 200 and "avatar_url" in r.json()["data"][0]


@pytest.mark.asyncio
async def test_personal_email_never_sees_workspaces(client: AsyncClient, session: AsyncSession) -> None:
    # Even if a workspace somehow had gmail.com saved, a gmail newcomer is offered nothing.
    ws = await _workspace(session, _domain())
    await session.execute(text("UPDATE tenants SET join_domain = 'gmail.com' WHERE id = :t"), {"t": ws["tenant_id"]})
    await session.commit()
    acc = await _account(session, f"p{uuid.uuid4().hex[:6]}@gmail.com")
    h = _newcomer_headers(acc, "p@gmail.com")
    assert (await client.get("/api/v1/join/workspaces", headers=h)).json()["data"] == []
    assert (await client.post(f"/api/v1/join/workspaces/{ws['tenant_id']}", headers=h)).status_code == 404
