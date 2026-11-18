# app/services/evidence.py
"""Evidence document for a risk's control test (migration 066).

One document per risk, kept in the private Supabase Storage bucket
risk-evidence. Files go through the backend with the service key (decision of
August 7, 2026), so the browser never writes to storage. The object path is
built here from the tenant and risk IDs and is never accepted from, or sent
to, the browser. Viewing uses a signed link that expires after
EVIDENCE_LINK_SECONDS.
"""

import logging
import re
import time
import uuid
from datetime import datetime, timezone
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ResourceNotFoundError, ServerError, ValidationError
from app.models.audit_log import AuditLog
from app.models.risk import Risk

logger = logging.getLogger(__name__)

EVIDENCE_BUCKET = "risk-evidence"
EVIDENCE_MAX_BYTES = 10 * 1024 * 1024
EVIDENCE_LINK_SECONDS = 60
EVIDENCE_NAME_MAX = 200
_EXT: dict[str, str] = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}
_UNSAFE_NAME = re.compile(r"[\x00-\x1f\x7f]")
_SAFE_SEGMENT = re.compile(r"[^A-Za-z0-9_-]")


def sniff_evidence_type(data: bytes) -> str | None:
    """The file type from its first bytes, never from its name or the browser's claim."""
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def clean_evidence_name(filename: str | None, mime: str) -> str:
    """Display name only: last path part, no control characters, capped length."""
    name = (filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = _UNSAFE_NAME.sub("", name).strip()
    if not name:
        name = f"evidence.{_EXT[mime]}"
    return name[:EVIDENCE_NAME_MAX]


def _storage_base() -> str:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise ServerError("File storage is not configured. Please contact support.")
    return f"{settings.SUPABASE_URL}/storage/v1"


def _auth_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_KEY,
    }


async def _storage_put(path: str, content: bytes, mime: str) -> None:
    url = f"{_storage_base()}/object/{EVIDENCE_BUCKET}/{path}"
    headers = {**_auth_headers(), "Content-Type": mime, "x-upsert": "false"}
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, content=content, headers=headers)
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.error("evidence upload failed | path=%s | %s", path, exc)
        raise ServerError("The evidence file could not be stored. Please try again.") from None


async def _storage_sign(path: str, seconds: int) -> str:
    base = _storage_base()
    url = f"{base}/object/sign/{EVIDENCE_BUCKET}/{path}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json={"expiresIn": seconds}, headers=_auth_headers())
            resp.raise_for_status()
            signed = str(resp.json().get("signedURL") or "")
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("evidence sign failed | path=%s | %s", path, exc)
        raise ServerError("The evidence file could not be opened. Please try again.") from None
    if not signed.startswith("/"):
        logger.error("evidence sign returned no link | path=%s", path)
        raise ServerError("The evidence file could not be opened. Please try again.")
    return f"{base}{signed}"


async def _storage_delete(paths: list[str]) -> None:
    url = f"{_storage_base()}/object/{EVIDENCE_BUCKET}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.request("DELETE", url, json={"prefixes": paths}, headers=_auth_headers())
        resp.raise_for_status()


async def delete_evidence_objects(paths: list[str]) -> None:
    """Best effort: a failed delete leaves an orphan file and never blocks the caller."""
    if not paths:
        return
    try:
        await _storage_delete(paths)
    except Exception as exc:
        logger.warning("evidence delete failed | count=%d | %s", len(paths), exc)


async def _locked_risk(db: AsyncSession, tenant_id: UUID, risk_id: str) -> Risk:
    """The risk row in this workspace, locked so two uploads cannot both keep an old file."""
    risk = (await db.execute(
        select(Risk)
        .where(Risk.tenant_id == tenant_id, Risk.id == risk_id)
        .with_for_update()
    )).scalar_one_or_none()
    if risk is None:
        raise ResourceNotFoundError(f"Risk {risk_id} not found")
    return risk


def _audit(tenant_id: UUID, user_email: str, action: str, risk_id: str, summary: str) -> AuditLog:
    return AuditLog(
        tenant_id=tenant_id, user_email=user_email, action=action,
        module="Risk", record_id=risk_id, summary=summary,
    )


async def upload_evidence(
    db: AsyncSession,
    tenant_id: UUID,
    risk_id: str,
    content: bytes,
    filename: str | None,
    user_email: str,
) -> None:
    """Store a document for the risk, replacing any earlier one."""
    if not content:
        raise ValidationError("The evidence file is empty.")
    if len(content) > EVIDENCE_MAX_BYTES:
        raise ValidationError("Evidence must be 10 MB or smaller.")
    mime = sniff_evidence_type(content)
    if mime is None:
        raise ValidationError("Evidence must be a PDF, PNG, JPEG or WebP file.")

    risk = await _locked_risk(db, tenant_id, risk_id)
    old_path = str(risk.evidence_path) if risk.evidence_path is not None else None
    name = clean_evidence_name(filename, mime)
    # Only letters, digits, - and _ from the risk ID, so no ID can change the folder.
    path = (f"evidence/{tenant_id}/{_SAFE_SEGMENT.sub('_', str(risk.id))}/"
            f"{int(time.time() * 1000)}_{uuid.uuid4().hex}.{_EXT[mime]}")

    await _storage_put(path, content, mime)

    risk.evidence_path        = path  # type: ignore[assignment]
    risk.evidence_name        = name  # type: ignore[assignment]
    risk.evidence_mime        = mime  # type: ignore[assignment]
    risk.evidence_size        = len(content)  # type: ignore[assignment]
    risk.evidence_uploaded_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    risk.evidence_uploaded_by = user_email  # type: ignore[assignment]
    verb = "Replaced" if old_path else "Added"
    db.add(_audit(tenant_id, user_email, "EVIDENCE_UPLOAD", risk_id, f"{verb} evidence on {risk_id}: {name}"))
    await db.flush()

    if old_path and old_path != path:
        await delete_evidence_objects([old_path])


async def remove_evidence(db: AsyncSession, tenant_id: UUID, risk_id: str, user_email: str) -> None:
    """Detach and delete the risk's document. Removing when there is none is a no-op."""
    risk = await _locked_risk(db, tenant_id, risk_id)
    if risk.evidence_path is None:
        return
    old_path = str(risk.evidence_path)
    old_name = str(risk.evidence_name or "")
    risk.evidence_path        = None  # type: ignore[assignment]
    risk.evidence_name        = None  # type: ignore[assignment]
    risk.evidence_mime        = None  # type: ignore[assignment]
    risk.evidence_size        = None  # type: ignore[assignment]
    risk.evidence_uploaded_at = None  # type: ignore[assignment]
    risk.evidence_uploaded_by = None  # type: ignore[assignment]
    db.add(_audit(tenant_id, user_email, "EVIDENCE_REMOVE", risk_id, f"Removed evidence on {risk_id}: {old_name}"))
    await db.flush()
    await delete_evidence_objects([old_path])


async def evidence_link(db: AsyncSession, tenant_id: UUID, risk_id: str) -> dict[str, str | int]:
    """A short-lived link to view the risk's document."""
    risk = (await db.execute(
        select(Risk.evidence_path, Risk.evidence_name, Risk.evidence_mime)
        .where(Risk.tenant_id == tenant_id, Risk.id == risk_id)
    )).one_or_none()
    if risk is None:
        raise ResourceNotFoundError(f"Risk {risk_id} not found")
    if risk.evidence_path is None:
        raise ResourceNotFoundError(f"Risk {risk_id} has no evidence document")
    url = await _storage_sign(str(risk.evidence_path), EVIDENCE_LINK_SECONDS)
    return {
        "url": url,
        "name": str(risk.evidence_name or ""),
        "mime": str(risk.evidence_mime or ""),
        "expires_in": EVIDENCE_LINK_SECONDS,
    }
