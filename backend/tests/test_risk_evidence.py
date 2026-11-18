"""
backend/tests/test_risk_evidence.py

Evidence document on a risk (migration 066): upload, replace, remove, signed
link, permissions, tenant isolation, recycle bin, and the evidenced rule.
Supabase Storage is never called: the storage helpers are replaced.
"""

import asyncio
import os
import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.migration_sql import SQL_DIR, split_sql
from app.services import evidence
from app.services.risk_status import is_evidenced
from conftest import _make_token, _OWNER_PERMS

PDF = b"%PDF-1.4\n%test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
TODAY = date.today()

_RISK = {
    "category": "Operational", "description": "Evidence test risk", "owner": "Test Owner",
    "treatment": "Mitigate", "likelihood": 3, "impact_score": 3,
}


@pytest_asyncio.fixture(autouse=True)
async def _drain_error_log_writes():
    """4xx answers write api_error_log in a fire-and-forget task. Wait for them."""
    yield
    pending = [t for t in asyncio.all_tasks()
               if t is not asyncio.current_task() and t.get_coro().__name__ == "_persist"]
    if pending:
        await asyncio.wait(pending, timeout=5)


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch) -> dict:
    """In-memory stand-in for the bucket. Records puts, signs and deletes."""
    state: dict = {"objects": {}, "deleted": [], "signed": []}

    async def put(path: str, content: bytes, mime: str) -> None:
        state["objects"][path] = (content, mime)

    async def sign(path: str, seconds: int) -> str:
        state["signed"].append((path, seconds))
        return f"https://test.supabase.co/storage/v1/object/sign/risk-evidence/{path}?token=t"

    async def remove(paths: list[str]) -> None:
        state["deleted"].extend(paths)
        for p in paths:
            state["objects"].pop(p, None)

    monkeypatch.setattr(evidence, "_storage_put", put)
    monkeypatch.setattr(evidence, "_storage_sign", sign)
    monkeypatch.setattr(evidence, "_storage_delete", remove)
    return state


async def _new_risk(client: AsyncClient, headers: dict) -> str:
    r = await client.post("/api/v1/risks", json=_RISK, headers=headers)
    assert r.status_code == 200
    return r.json()["data"]["id"]


def _file(content: bytes, name: str = "test.pdf", mime: str = "application/pdf") -> dict:
    return {"file": (name, content, mime)}


# ── Rule ────────────────────────────────────────────────────────────────────

def test_evidenced_needs_test_source_and_document():
    recent = TODAY - timedelta(days=10)
    ok = dict(control_last_tested=recent, control_assertion_source="External audit", today=TODAY)
    assert is_evidenced(**ok, has_document=True) is True
    assert is_evidenced(**ok, has_document=False) is False
    assert is_evidenced(control_last_tested=recent, control_assertion_source="Self-assessed",
                        has_document=True, today=TODAY) is False
    assert is_evidenced(control_last_tested=TODAY - timedelta(days=400),
                        control_assertion_source="External audit", has_document=True, today=TODAY) is False


def test_sniff_and_name_cleaning():
    assert evidence.sniff_evidence_type(PDF) == "application/pdf"
    assert evidence.sniff_evidence_type(PNG) == "image/png"
    assert evidence.sniff_evidence_type(b"\xff\xd8\xff\xe0rest") == "image/jpeg"
    assert evidence.sniff_evidence_type(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "image/webp"
    assert evidence.sniff_evidence_type(b"PK\x03\x04docx") is None
    assert evidence.sniff_evidence_type(b"<html>") is None
    assert evidence.clean_evidence_name("C:\\audit\\..\\report.pdf", "application/pdf") == "report.pdf"
    assert evidence.clean_evidence_name("../../etc/a\x00b.png", "image/png") == "ab.png"
    assert evidence.clean_evidence_name("", "image/png") == "evidence.png"
    assert len(evidence.clean_evidence_name("x" * 500, "application/pdf")) == evidence.EVIDENCE_NAME_MAX


# ── Upload, link, replace, remove ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_upload_link_replace_remove(client: AsyncClient, owner_headers: dict, analyst_headers: dict,
                                          storage: dict, seed: dict):
    rid = await _new_risk(client, owner_headers)
    r = await client.get(f"/api/v1/risks/{rid}", headers=owner_headers)
    assert r.json()["data"]["has_evidence"] is False

    r = await client.post(f"/api/v1/risks/{rid}/evidence", files=_file(PDF, "SOC2 report.pdf"), headers=owner_headers)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["has_evidence"] is True
    assert data["evidence_name"] == "SOC2 report.pdf"
    assert data["evidence_mime"] == "application/pdf"
    assert data["evidence_size"] == len(PDF)
    assert data["evidence_uploaded_by"] == seed["email"]
    assert "evidence_path" not in data                       # the storage path never leaves the backend
    (first_path,) = storage["objects"].keys()
    assert first_path.startswith(f"evidence/{seed['tenant_id']}/{rid}/") and first_path.endswith(".pdf")

    # An Analyst without manage_risks can view (auditor use) but not change.
    r = await client.get(f"/api/v1/risks/{rid}/evidence/link", headers=analyst_headers)
    assert r.status_code == 200
    link = r.json()["data"]
    assert link["name"] == "SOC2 report.pdf" and link["mime"] == "application/pdf"
    assert link["expires_in"] == evidence.EVIDENCE_LINK_SECONDS
    assert storage["signed"][-1] == (first_path, evidence.EVIDENCE_LINK_SECONDS)
    r = await client.post(f"/api/v1/risks/{rid}/evidence", files=_file(PDF), headers=analyst_headers)
    assert r.status_code == 403
    r = await client.delete(f"/api/v1/risks/{rid}/evidence", headers=analyst_headers)
    assert r.status_code == 403

    # Replace: the new file is stored and the old one deleted.
    r = await client.post(f"/api/v1/risks/{rid}/evidence", files=_file(PNG, "photo.png", "image/png"), headers=owner_headers)
    assert r.status_code == 200
    assert r.json()["data"]["evidence_mime"] == "image/png"
    assert storage["deleted"] == [first_path]
    assert list(storage["objects"].keys())[0].endswith(".png")

    # Remove: columns cleared, file deleted, a second remove is a no-op.
    r = await client.delete(f"/api/v1/risks/{rid}/evidence", headers=owner_headers)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["has_evidence"] is False and data["evidence_name"] is None
    assert storage["objects"] == {}
    assert (await client.delete(f"/api/v1/risks/{rid}/evidence", headers=owner_headers)).status_code == 200
    r = await client.get(f"/api/v1/risks/{rid}/evidence/link", headers=owner_headers)
    assert r.status_code == 404

    # Every change is audited.
    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    async with engine.connect() as conn:
        actions = (await conn.execute(text(
            "SELECT action FROM audit_logs WHERE tenant_id = :t AND record_id = :r AND action LIKE 'EVIDENCE_%'"
        ), {"t": seed["tenant_id"], "r": rid})).scalars().all()
    await engine.dispose()
    assert sorted(actions) == ["EVIDENCE_REMOVE", "EVIDENCE_UPLOAD", "EVIDENCE_UPLOAD"]


@pytest.mark.asyncio
async def test_upload_rejects_bad_files(client: AsyncClient, owner_headers: dict, storage: dict):
    rid = await _new_risk(client, owner_headers)
    # A renamed file is refused: the type comes from the bytes, not the name.
    r = await client.post(f"/api/v1/risks/{rid}/evidence", files=_file(b"PK\x03\x04word", "fake.pdf"), headers=owner_headers)
    assert r.status_code == 422 and "PDF, PNG, JPEG or WebP" in r.json()["error"]
    r = await client.post(f"/api/v1/risks/{rid}/evidence", files=_file(b"", "empty.pdf"), headers=owner_headers)
    assert r.status_code == 422
    big = b"%PDF-" + b"0" * evidence.EVIDENCE_MAX_BYTES
    r = await client.post(f"/api/v1/risks/{rid}/evidence", files=_file(big, "big.pdf"), headers=owner_headers)
    assert r.status_code == 422 and "10 MB" in r.json()["error"]
    assert storage["objects"] == {}
    r = await client.post("/api/v1/risks/R-NOPE/evidence", files=_file(PDF), headers=owner_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_storage_failure_keeps_old_document(client: AsyncClient, owner_headers: dict,
                                                  storage: dict, monkeypatch: pytest.MonkeyPatch):
    rid = await _new_risk(client, owner_headers)
    assert (await client.post(f"/api/v1/risks/{rid}/evidence", files=_file(PDF, "a.pdf"), headers=owner_headers)).status_code == 200

    async def boom(path: str, content: bytes, mime: str) -> None:
        from app.core.exceptions import ServerError
        raise ServerError("The evidence file could not be stored. Please try again.")

    monkeypatch.setattr(evidence, "_storage_put", boom)
    r = await client.post(f"/api/v1/risks/{rid}/evidence", files=_file(PNG, "b.png", "image/png"), headers=owner_headers)
    assert r.status_code == 500 and "could not be stored" in r.json()["error"]
    r = await client.get(f"/api/v1/risks/{rid}", headers=owner_headers)
    assert r.json()["data"]["evidence_name"] == "a.pdf"
    assert storage["deleted"] == []


@pytest.mark.asyncio
async def test_storage_not_configured(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(evidence.settings, "SUPABASE_URL", "")
    from app.core.exceptions import ServerError
    with pytest.raises(ServerError, match="not configured"):
        await evidence._storage_put("evidence/x/y.pdf", PDF, "application/pdf")


# ── Tenant isolation ────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def other_space_headers(seed) -> dict:
    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    other = uuid.uuid4()
    async with maker() as s:
        await s.execute(text("""
            INSERT INTO tenants (id, name, industry, plan, trial_start_date, payment_active,
                max_risks, max_users, modules, currency_symbol, created_by, created_at, updated_at)
            VALUES (:id, 'Evidence Other', 'Technology', 'TRIAL', CURRENT_DATE, false,
                1000, 25, ARRAY['risk','incident'], '$', :by, now(), now())
        """), {"id": str(other), "by": seed["account_id"]})
        await s.commit()
    await engine.dispose()
    return {"Authorization": f"Bearer {_make_token({**seed, 'tenant_id': str(other)}, 'Owner', _OWNER_PERMS, ['risk', 'incident'])}"}


@pytest.mark.asyncio
async def test_other_workspace_cannot_reach_evidence(client: AsyncClient, owner_headers: dict,
                                                     other_space_headers: dict, storage: dict):
    rid = await _new_risk(client, owner_headers)
    assert (await client.post(f"/api/v1/risks/{rid}/evidence", files=_file(PDF), headers=owner_headers)).status_code == 200
    r = await client.get(f"/api/v1/risks/{rid}/evidence/link", headers=other_space_headers)
    assert r.status_code == 404 and "url" not in (r.json().get("data") or {})
    assert (await client.delete(f"/api/v1/risks/{rid}/evidence", headers=other_space_headers)).status_code == 404
    assert (await client.post(f"/api/v1/risks/{rid}/evidence", files=_file(PDF), headers=other_space_headers)).status_code == 404
    assert len(storage["objects"]) == 1 and storage["deleted"] == []


# ── Recycle bin ─────────────────────────────────────────────────────────────

async def _bin_id(client: AsyncClient, headers: dict, rid: str) -> str:
    r = await client.get("/api/v1/recycle", headers=headers)
    assert r.status_code == 200
    return next(i["bin_id"] for i in r.json()["data"] if i["item_id"] == rid)


@pytest.mark.asyncio
async def test_bin_restore_keeps_and_purge_deletes_file(client: AsyncClient, owner_headers: dict, storage: dict):
    rid = await _new_risk(client, owner_headers)
    assert (await client.post(f"/api/v1/risks/{rid}/evidence", files=_file(PDF, "keep.pdf"), headers=owner_headers)).status_code == 200
    (path,) = storage["objects"].keys()

    # Delete then restore: the file stays and is attached again.
    assert (await client.delete(f"/api/v1/risks/{rid}", headers=owner_headers)).status_code == 200
    assert storage["deleted"] == []
    bin_id = await _bin_id(client, owner_headers, rid)
    assert (await client.post(f"/api/v1/recycle/{bin_id}/restore", headers=owner_headers)).status_code == 200
    r = await client.get(f"/api/v1/risks/{rid}", headers=owner_headers)
    assert r.json()["data"]["evidence_name"] == "keep.pdf"
    assert (await client.get(f"/api/v1/risks/{rid}/evidence/link", headers=owner_headers)).status_code == 200

    # Delete then delete forever: the file goes too.
    assert (await client.delete(f"/api/v1/risks/{rid}", headers=owner_headers)).status_code == 200
    bin_id = await _bin_id(client, owner_headers, rid)
    assert (await client.delete(f"/api/v1/recycle/{bin_id}", headers=owner_headers)).status_code == 200
    assert storage["deleted"] == [path]


@pytest.mark.asyncio
async def test_scheduled_purge_deletes_files(client: AsyncClient, owner_headers: dict, storage: dict):
    from app.services.recycle import purge_expired
    rid = await _new_risk(client, owner_headers)
    assert (await client.post(f"/api/v1/risks/{rid}/evidence", files=_file(PDF), headers=owner_headers)).status_code == 200
    (path,) = storage["objects"].keys()
    assert (await client.delete(f"/api/v1/risks/{rid}", headers=owner_headers)).status_code == 200

    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        await s.execute(text("UPDATE recycle_bin SET purge_at = now() - interval '1 day' WHERE item_id = :i"), {"i": rid})
        await s.commit()
        async with s.begin():
            await purge_expired(s)
    await engine.dispose()
    assert path in storage["deleted"]


# ── Dashboard rule end to end ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dashboard_counts_evidenced_only_with_document(client: AsyncClient, owner_headers: dict, storage: dict):
    body = {**_RISK, "control_effectiveness": 3, "control_last_tested": str(TODAY - timedelta(days=5)),
            "control_assertion_source": "External audit"}
    r = await client.post("/api/v1/risks", json=body, headers=owner_headers)
    assert r.status_code == 200
    rid = r.json()["data"]["id"]

    async def status() -> str:
        d = await client.get("/api/v1/dashboard", headers=owner_headers)
        assert d.status_code == 200
        rows = d.json()["data"]["control_evidence"]["rows"]
        return next(x["status"] for x in rows if x["risk_id"] == rid)

    assert await status() == "unevidenced"
    assert (await client.post(f"/api/v1/risks/{rid}/evidence", files=_file(PDF), headers=owner_headers)).status_code == 200
    assert await status() == "evidenced"


# ── Migration SQL ───────────────────────────────────────────────────────────

def test_migration_sql_files_split_cleanly():
    up = split_sql((SQL_DIR / "066_risk_evidence.sql").read_text())
    down = split_sql((SQL_DIR / "066_risk_evidence_down.sql").read_text())
    assert len(up) == 6 and all("ADD COLUMN IF NOT EXISTS evidence_" in s for s in up)
    assert len(down) == 6 and all("DROP COLUMN IF EXISTS evidence_" in s for s in down)
