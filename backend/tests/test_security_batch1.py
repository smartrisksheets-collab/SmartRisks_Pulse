"""
Gap map batch 1: PIN lockout per member, admin sign-in lockout, review
permissions on outside submissions, the public form's IP, and sign-in timing.
"""

import asyncio
import os
import uuid
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

import bcrypt
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.exceptions import InvalidCredentialsError, InvalidPINError, PermissionDeniedError
from app.core.rate_limit import client_ip
from app.core.security import create_access_token, hash_pin
from app.schemas.external import ExternalRiskSubmit
from app.schemas.submission import SubmissionTokenCreate
from app.services import admin_auth as admin_auth_svc
from app.services import auth as auth_svc
from app.services import external as ext_svc
from app.services import lockout
from app.services import submission as sub_svc
from conftest import _make_token


@pytest_asyncio.fixture
async def session(seed):
    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


async def _account(s: AsyncSession) -> tuple[str, str]:
    aid = str(uuid.uuid4())
    email = f"m-{aid[:8]}@example.com"
    await s.execute(
        text("INSERT INTO accounts (id, email, name, token_version, created_at, updated_at) "
             "VALUES (:id, :e, 'Member', 1, now(), now())"),
        {"id": aid, "e": email},
    )
    return aid, email


async def _pin_workspace(s: AsyncSession, seed: dict, pin: str = "123456") -> str:
    tid = str(uuid.uuid4())
    await s.execute(
        text("""
            INSERT INTO tenants (id, name, industry, plan, trial_start_date, payment_active,
                max_risks, max_users, modules, currency_symbol, created_by, pin_hash,
                created_at, updated_at)
            VALUES (:id, 'PIN Test', 'Technology', 'TRIAL', CURRENT_DATE, false, 1000, 25,
                ARRAY['risk','incident'], '$', :cb, :ph, now(), now())
        """),
        {"id": tid, "cb": seed["account_id"], "ph": hash_pin(pin)},
    )
    return tid


async def _member(s: AsyncSession, tid: str, aid: str, status: str = "ACTIVE") -> str:
    mid = str(uuid.uuid4())
    await s.execute(
        text("INSERT INTO workspace_members (id, account_id, tenant_id, role, status, permissions, "
             "created_at, updated_at) VALUES (:id, :a, :t, 'Owner', :st, '{}', now(), now())"),
        {"id": mid, "a": aid, "t": tid, "st": status},
    )
    return mid


def _pending_headers(aid: str, email: str, tid: str) -> dict:
    tok = create_access_token(
        {"sub": aid, "email": email, "pending_tenant_id": tid},
        expires_delta=timedelta(minutes=10),
    )
    return {"Authorization": f"Bearer {tok}"}


# ── Item 1: PIN lockout ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_pin_lockout_survives_request_rollback(client: AsyncClient, session: AsyncSession, seed: dict) -> None:
    """Five wrong PINs through the real route lock the member, even with the correct PIN after."""
    tid = await _pin_workspace(session, seed)
    aid, email = await _account(session)
    await _member(session, tid, aid)
    other_aid, other_email = await _account(session)
    await _member(session, tid, other_aid)
    await session.commit()

    headers = _pending_headers(aid, email, tid)
    for left in (4, 3, 2, 1):
        r = await client.post("/api/v1/auth/verify-pin", json={"pin": "000000"}, headers=headers)
        assert r.status_code == 401
        assert f"{left} attempt" in r.json()["error"]
    r = await client.post("/api/v1/auth/verify-pin", json={"pin": "000000"}, headers=headers)
    assert "locked out for 15 minutes" in r.json()["error"]

    r = await client.post("/api/v1/auth/verify-pin", json={"pin": "123456"}, headers=headers)
    assert r.status_code == 401
    assert "Try again in 15 minutes" in r.json()["error"]

    # A teammate in the same workspace is not locked out.
    r = await client.post("/api/v1/auth/verify-pin", json={"pin": "123456"},
                          headers=_pending_headers(other_aid, other_email, tid))
    assert r.status_code == 200
    assert r.json()["data"]["access_token"]


@pytest.mark.asyncio
async def test_pin_success_resets_count_and_expired_lock_clears(session: AsyncSession, seed: dict) -> None:
    tid = await _pin_workspace(session, seed)
    aid, _ = await _account(session)
    mid = await _member(session, tid, aid)
    await session.commit()
    claims = {"sub": aid, "pending_tenant_id": tid}

    for _ in range(3):
        with pytest.raises(InvalidPINError):
            await auth_svc.verify_pin_and_issue_token(session, claims, "999999")
    await auth_svc.verify_pin_and_issue_token(session, claims, "123456")
    await session.commit()
    attempts = await session.scalar(text("SELECT pin_attempts FROM workspace_members WHERE id = :id"), {"id": mid})
    assert attempts == 0

    # A lock in the past no longer blocks.
    await session.execute(
        text("UPDATE workspace_members SET pin_locked_until = now() - interval '1 minute' WHERE id = :id"),
        {"id": mid},
    )
    await session.commit()
    out = await auth_svc.verify_pin_and_issue_token(session, claims, "123456")
    assert out["access_token"]


@pytest.mark.asyncio
async def test_pin_failures_at_the_same_moment_all_count(session: AsyncSession, seed: dict) -> None:
    tid = await _pin_workspace(session, seed)
    aid, _ = await _account(session)
    mid = await _member(session, tid, aid)
    await session.commit()

    await asyncio.gather(*[
        lockout.record_failure("member_pin", mid, settings.PIN_MAX_ATTEMPTS, settings.PIN_LOCK_MINUTES)
        for _ in range(settings.PIN_MAX_ATTEMPTS)
    ])
    assert await lockout.locked_seconds(session, "member_pin", mid) > 14 * 60


@pytest.mark.asyncio
async def test_pin_inactive_member_and_removed_pin(session: AsyncSession, seed: dict) -> None:
    tid = await _pin_workspace(session, seed)
    aid, _ = await _account(session)
    await _member(session, tid, aid, status="DEACTIVATED")
    aid2, _ = await _account(session)
    await _member(session, tid, aid2)
    await session.commit()

    from app.core.exceptions import InvalidTokenError, ResourceNotFoundError
    with pytest.raises(ResourceNotFoundError):
        await auth_svc.verify_pin_and_issue_token(session, {"sub": aid, "pending_tenant_id": tid}, "123456")

    await session.execute(text("UPDATE tenants SET pin_hash = NULL WHERE id = :t"), {"t": tid})
    await session.commit()
    with pytest.raises(InvalidTokenError):
        await auth_svc.verify_pin_and_issue_token(session, {"sub": aid2, "pending_tenant_id": tid}, "123456")


# ── Item 2: admin sign-in ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_new_or_removed_pin_clears_every_member_lock(session: AsyncSession, seed: dict) -> None:
    from app.schemas.settings import PINSet
    from app.services import settings as settings_svc
    tid = await _pin_workspace(session, seed)
    aid, _ = await _account(session)
    mid = await _member(session, tid, aid)
    lock = text("UPDATE workspace_members SET pin_attempts = 5, pin_locked_until = now() + interval '15 minutes' WHERE id = :id")
    state = text("SELECT pin_attempts, pin_locked_until FROM workspace_members WHERE id = :id")
    for change in (lambda: settings_svc.set_pin(session, uuid.UUID(tid), PINSet(new_pin="654321")),
                   lambda: settings_svc.remove_pin(session, uuid.UUID(tid), "Owner")):
        await session.execute(lock, {"id": mid})
        await change()
        assert tuple((await session.execute(state, {"id": mid})).one()) == (0, None)


async def _admin(s: AsyncSession, status: str = "ACTIVE") -> str:
    email = f"admin-{uuid.uuid4().hex[:8]}@example.com"
    pw = bcrypt.hashpw(b"AdminPass1!", bcrypt.gensalt(4)).decode()
    await s.execute(
        text("INSERT INTO admin_accounts (id, email, name, password_hash, role, status, created_at, updated_at) "
             "VALUES (:id, :e, 'Admin', :pw, 'admin', :st, now(), now())"),
        {"id": str(uuid.uuid4()), "e": email, "pw": pw, "st": status},
    )
    await s.commit()
    return email


@pytest.mark.asyncio
async def test_admin_lockout_after_five_failures(session: AsyncSession) -> None:
    email = await _admin(session)
    for _ in range(settings.ADMIN_LOGIN_MAX_ATTEMPTS):
        with pytest.raises(InvalidCredentialsError, match="Invalid email or password"):
            await admin_auth_svc.login(email, "wrong", session)
        await session.rollback()  # what get_db does on the error
    with pytest.raises(InvalidCredentialsError, match="Too many failed sign-in attempts"):
        await admin_auth_svc.login(email, "AdminPass1!", session)


@pytest.mark.asyncio
async def test_admin_success_resets_and_inactive_is_refused(session: AsyncSession) -> None:
    email = await _admin(session)
    for _ in range(2):
        with pytest.raises(InvalidCredentialsError):
            await admin_auth_svc.login(email, "wrong", session)
    out = await admin_auth_svc.login(email, "AdminPass1!", session)
    await session.commit()
    assert out.access_token
    attempts = await session.scalar(
        text("SELECT failed_login_attempts FROM admin_accounts WHERE email = :e"), {"e": email})
    assert attempts == 0

    inactive = await _admin(session, status="INACTIVE")
    with pytest.raises(InvalidCredentialsError, match="inactive"):
        await admin_auth_svc.login(inactive, "AdminPass1!", session)


@pytest.mark.asyncio
async def test_admin_login_route_is_rate_limited(client: AsyncClient) -> None:
    codes = []
    for _ in range(6):
        r = await client.post("/api/admin/auth/login", json={"email": "nobody@example.com", "password": "x"})
        codes.append(r.status_code)
    assert codes[:5] == [401] * 5
    assert codes[5] == 429
    assert r.json() == {"data": None, "error": "Too many requests. Please wait a minute and try again.", "meta": {}}


# ── Item 25: sign-in timing ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_unknown_email_still_runs_a_password_check(session: AsyncSession) -> None:
    with patch("app.services.auth.burn_password_check") as user_burn:
        with pytest.raises(InvalidCredentialsError):
            await auth_svc.login(session, "ghost@example.com", "whatever1")
    user_burn.assert_called_once_with("whatever1")
    with patch("app.services.admin_auth.burn_password_check") as admin_burn:
        with pytest.raises(InvalidCredentialsError):
            await admin_auth_svc.login("ghost-admin@example.com", "whatever1", session)
    admin_burn.assert_called_once_with("whatever1")


# ── Item 3: reviewing outside submissions ────────────────────────────────────

_RISKS_ONLY = {"manage_risks": True, "manage_incidents": False}


async def _pending_risk(s: AsyncSession, tid: str) -> str:
    res = await ext_svc.submit_risk(s, uuid.UUID(tid), ExternalRiskSubmit(
        submitter_name="Ada", submitter_email="ada@example.com",
        category="Operational", description="Vendor outage risk for payroll",
        likelihood=3, impact_score=3,
    ))
    await s.commit()
    return res.id


@pytest.mark.asyncio
async def test_analyst_cannot_approve_or_return_or_list(client: AsyncClient, session: AsyncSession,
                                                        seed: dict, analyst_headers: dict) -> None:
    sid = await _pending_risk(session, seed["tenant_id"])
    r = await client.post(f"/api/v1/external/{sid}/approve", json={"reviewer_notes": ""}, headers=analyst_headers)
    assert r.status_code == 403
    r = await client.post(f"/api/v1/external/{sid}/return", json={"return_message": "Need more detail"},
                          headers=analyst_headers)
    assert r.status_code == 403
    r = await client.get("/api/v1/external/pending", headers=analyst_headers)
    assert r.json()["data"]["total"] == 0
    r = await client.get("/api/v1/external/pending/count", headers=analyst_headers)
    assert r.json()["data"]["count"] == 0


@pytest.mark.asyncio
async def test_risk_manager_approves_risk_and_email_is_recorded(client: AsyncClient, session: AsyncSession,
                                                                seed: dict) -> None:
    sid = await _pending_risk(session, seed["tenant_id"])
    headers = {"Authorization": f"Bearer {_make_token(seed, 'Manager', _RISKS_ONLY, ['risk', 'incident'])}"}
    r = await client.get("/api/v1/external/pending", headers=headers)
    assert sid in [i["id"] for i in r.json()["data"]["items"]]
    r = await client.post(f"/api/v1/external/{sid}/approve", json={"reviewer_notes": ""}, headers=headers)
    assert r.status_code == 200
    reviewed_by = await session.scalar(
        text("SELECT reviewed_by FROM external_submissions WHERE id = :id"), {"id": sid})
    assert reviewed_by == seed["email"]


@pytest.mark.asyncio
async def test_incident_needs_manage_incidents(session: AsyncSession, seed: dict) -> None:
    from app.schemas.external import ExternalIncidentSubmit
    from tests.test_external_incident_form import _levels
    tid = uuid.UUID(seed["tenant_id"])
    await _levels(session, tid)
    res = await ext_svc.submit_incident(session, tid, ExternalIncidentSubmit(
        reported_by="Ada", description="Payroll down", category="IT", severity="Critical",
    ))
    await session.commit()
    with pytest.raises(PermissionDeniedError, match="manage_incidents"):
        await ext_svc.approve_submission(session, tid, res.id, "m@example.com", _RISKS_ONLY)
    await session.rollback()
    assert ext_svc.reviewable_types(_RISKS_ONLY) == ["risk"]
    listed = await ext_svc.list_pending(session, tid, ["risk"])
    assert res.id not in [i.id for i in listed.items]


# ── Item 4: public form IP and limits ────────────────────────────────────────

def _req(host: str, xff: str | None) -> SimpleNamespace:
    headers = {"X-Forwarded-For": xff} if xff else {}
    return SimpleNamespace(client=SimpleNamespace(host=host), headers=headers)


def test_client_ip_ignores_forwarded_header_from_untrusted_caller(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "TRUSTED_PROXY_IPS", "10.0.0.0/8")
    assert client_ip(_req("203.0.113.9", "1.2.3.4")) == "203.0.113.9"  # type: ignore[arg-type]
    assert client_ip(_req("10.1.2.3", "1.2.3.4, 10.1.2.3")) == "1.2.3.4"  # type: ignore[arg-type]
    assert client_ip(_req("10.1.2.3", None)) == "10.1.2.3"  # type: ignore[arg-type]
    assert client_ip(SimpleNamespace(client=None, headers={})) == "unknown"  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_public_form_stores_real_ip_not_faked_header(client: AsyncClient, session: AsyncSession,
                                                          seed: dict) -> None:
    tok = await sub_svc.create_token(session, uuid.UUID(seed["tenant_id"]), uuid.UUID(seed["account_id"]),
                                     SubmissionTokenCreate(label="Ops", department="Ops"))
    await session.commit()
    body = {"submitter_name": "Ada", "submitter_email": "ada@example.com", "submission_type": "risk",
            "description": "A long enough description of a new risk."}
    with patch("app.services.submission._send_acknowledgement"):
        r = await client.post(f"/api/v1/submissions/form/{tok.token}", json=body,
                              headers={"X-Forwarded-For": "6.6.6.6"})
    assert r.status_code == 200, r.text
    ip = await session.scalar(
        text("SELECT submitter_ip FROM risk_submissions WHERE workspace_id = :w ORDER BY submitted_at DESC LIMIT 1"),
        {"w": seed["tenant_id"]},
    )
    assert ip == "127.0.0.1"


@pytest.mark.asyncio
async def test_public_form_get_is_rate_limited(client: AsyncClient) -> None:
    codes = [(await client.get("/api/v1/submissions/form/not-a-token")).status_code for _ in range(31)]
    assert codes[:30] == [404] * 30
    assert codes[30] == 429
