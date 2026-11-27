"""
backend/tests/test_profile.py

My profile (batch 4): read and change your own name, upload, replace and
remove a photo, the brief greeting by first name, and the orphan sweep
keeping profile photos.
"""

import os
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token
from app.scheduler.jobs import _ORPHAN_LOGO_SQL
from app.services import brief as brief_svc
from app.services import profile as profile_svc

_PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32


@pytest_asyncio.fixture
async def session(seed):
    engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


async def _account(s: AsyncSession, first: str | None = "Ada", last: str | None = "Obi",
                   name: str | None = "Ada Obi") -> tuple[uuid.UUID, str, dict]:
    acc = uuid.uuid4()
    email = f"prof-{acc.hex[:10]}@example.com"
    await s.execute(
        text("""
            INSERT INTO accounts (id, email, name, first_name, last_name, token_version, created_at, updated_at)
            VALUES (:id, :e, :n, :f, :l, 1, now(), now())
        """),
        {"id": str(acc), "e": email, "n": name, "f": first, "l": last},
    )
    await s.commit()
    token = create_access_token({"sub": str(acc), "email": email, "workspaces": []})
    return acc, email, {"Authorization": f"Bearer {token}"}


async def _row(s: AsyncSession, acc: uuid.UUID):
    return (await s.execute(
        text("SELECT first_name, last_name, name, avatar_url FROM accounts WHERE id = :id"), {"id": str(acc)}
    )).one()


@pytest.mark.asyncio
async def test_get_profile_needs_no_workspace(client: AsyncClient, session: AsyncSession) -> None:
    acc, email, h = await _account(session)
    r = await client.get("/api/v1/me", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["data"] == {"first_name": "Ada", "last_name": "Obi", "email": email, "avatar_url": None}


@pytest.mark.asyncio
async def test_get_profile_without_split_name_falls_back(client: AsyncClient, session: AsyncSession) -> None:
    _, _, h = await _account(session, first=None, last=None, name="Chinedu Ozulumba Okafor")
    d = (await client.get("/api/v1/me", headers=h)).json()["data"]
    assert (d["first_name"], d["last_name"]) == ("Chinedu", "Ozulumba Okafor")


@pytest.mark.asyncio
async def test_update_name_writes_all_three_columns(client: AsyncClient, session: AsyncSession) -> None:
    acc, _, h = await _account(session)
    r = await client.patch("/api/v1/me", headers=h, json={"first_name": " Mary  Jane ", "last_name": "Watson"})
    assert r.status_code == 200, r.text
    row = await _row(session, acc)
    assert (row.first_name, row.last_name, row.name) == ("Mary Jane", "Watson", "Mary Jane Watson")


@pytest.mark.asyncio
async def test_update_refuses_blank_names(client: AsyncClient, session: AsyncSession) -> None:
    acc, _, h = await _account(session)
    r = await client.patch("/api/v1/me", headers=h, json={"first_name": "Ada", "last_name": "  "})
    assert r.status_code == 422 and "last name" in r.text
    r = await client.patch("/api/v1/me", headers=h, json={"first_name": "", "last_name": "Obi"})
    assert r.status_code == 422 and "first name" in r.text
    row = await _row(session, acc)
    assert (row.first_name, row.last_name) == ("Ada", "Obi")


@pytest.mark.asyncio
async def test_email_cannot_be_changed(client: AsyncClient, session: AsyncSession) -> None:
    _, email, h = await _account(session)
    r = await client.patch("/api/v1/me", headers=h,
                           json={"first_name": "Ada", "last_name": "Obi", "email": "x@example.com"})
    assert r.status_code == 200
    assert r.json()["data"]["email"] == email


@pytest.mark.asyncio
async def test_profile_needs_sign_in(client: AsyncClient) -> None:
    r = await client.get("/api/v1/me")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_photo_upload_replace_and_remove(
    client: AsyncClient, session: AsyncSession, monkeypatch: pytest.MonkeyPatch,
) -> None:
    acc, _, h = await _account(session)
    uploaded: list[str] = []
    deleted: list[str] = []

    async def fake_upload(content: bytes, folder: str, what: str) -> str:
        url = f"https://x/storage/v1/object/public/workspace-logos/{folder}/{len(uploaded)}.png"
        uploaded.append(url)
        return url

    async def fake_delete(url: str) -> None:
        deleted.append(url)

    monkeypatch.setattr(profile_svc, "upload_image", fake_upload)
    monkeypatch.setattr(profile_svc, "_delete_logo_from_storage", fake_delete)

    files = {"file": ("me.png", _PNG, "image/png")}
    r = await client.post("/api/v1/me/photo", headers=h, files=files)
    assert r.status_code == 200, r.text
    assert f"avatars/{acc}/" in r.json()["data"]["avatar_url"]

    r = await client.post("/api/v1/me/photo", headers=h, files=files)
    assert r.json()["data"]["avatar_url"] == uploaded[1]
    assert deleted == [uploaded[0]]  # the replaced photo is removed from storage

    r = await client.delete("/api/v1/me/photo", headers=h)
    assert r.status_code == 200 and r.json()["data"]["avatar_url"] is None
    assert deleted == [uploaded[0], uploaded[1]]
    assert (await _row(session, acc)).avatar_url is None


@pytest.mark.asyncio
async def test_photo_must_be_an_image(client: AsyncClient, session: AsyncSession) -> None:
    acc, _, h = await _account(session)
    r = await client.post("/api/v1/me/photo", headers=h, files={"file": ("x.png", b"not an image", "image/png")})
    assert r.status_code == 422 and "PNG, JPEG or WebP" in r.text
    assert (await _row(session, acc)).avatar_url is None


@pytest.mark.asyncio
async def test_photo_size_limit(client: AsyncClient, session: AsyncSession) -> None:
    _, _, h = await _account(session)
    big = _PNG + b"0" * (2 * 1024 * 1024)
    r = await client.post("/api/v1/me/photo", headers=h, files={"file": ("x.png", big, "image/png")})
    assert r.status_code == 422 and "2 MB" in r.text


@pytest.mark.asyncio
async def test_brief_greets_by_first_name(session: AsyncSession) -> None:
    _, email, _ = await _account(session, first="Mary Jane", last="Watson", name="Mary Jane Watson")
    assert await brief_svc._reader_first_name(session, email.upper()) == "Mary Jane"
    # No account, or no name saved: the old guess from the email.
    assert await brief_svc._reader_first_name(session, "john.doe@example.com") == "John"
    _, email2, _ = await _account(session, first=None, last=None, name=None)
    assert await brief_svc._reader_first_name(session, email2) == "Prof"


def test_orphan_sweep_keeps_profile_photos() -> None:
    sql = str(_ORPHAN_LOGO_SQL)
    assert "FROM accounts a" in sql and "a.avatar_url" in sql
