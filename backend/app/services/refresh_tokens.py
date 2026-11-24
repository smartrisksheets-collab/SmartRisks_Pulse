"""Single-use refresh tokens, logout that really ends the session, and
"log out everywhere".

A refresh token is valid until it is used once, its owner logs out, or the
account's token_version changes. Each token carries a jti (older tokens are
keyed by a hash of the token). Using a token records its jti; a second use
means the token was copied, so every session of that account is ended.

Two tabs can refresh at the same moment with the same cookie. A second use
within GRACE_SECONDS of the first is allowed so that does not log people out.
"""

import hashlib
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InvalidTokenError
from app.db.session import AsyncSessionLocal

GRACE_SECONDS = 30


def token_key(claims: dict, raw_token: str) -> str:
    jti = claims.get("jti")
    if isinstance(jti, str) and jti:
        return jti
    return "sha256:" + hashlib.sha256(raw_token.encode()).hexdigest()


def _expiry(claims: dict) -> datetime:
    exp = claims.get("exp")
    if isinstance(exp, (int, float)):
        return datetime.fromtimestamp(exp, tz=timezone.utc)
    return datetime.now(timezone.utc)


async def revoke(db: AsyncSession, claims: dict, raw_token: str, reason: str) -> bool:
    """Record the token as used. False when it was already recorded."""
    inserted = await db.scalar(
        text("""
            INSERT INTO revoked_refresh_tokens (jti, account_id, reason, expires_at)
            VALUES (:jti, CAST(:acc AS uuid), :reason, :exp)
            ON CONFLICT (jti) DO NOTHING
            RETURNING 1
        """),
        {"jti": token_key(claims, raw_token), "acc": str(claims["sub"]),
         "reason": reason, "exp": _expiry(claims)},
    )
    return inserted is not None


async def end_all_sessions(account_id: UUID) -> None:
    """Bump token_version in its own committed session, so the caller can
    raise afterwards without the request rollback undoing it."""
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("UPDATE accounts SET token_version = COALESCE(token_version, 1) + 1 WHERE id = :id"),
            {"id": str(account_id)},
        )
        await session.commit()


async def use_for_refresh(db: AsyncSession, claims: dict, raw_token: str) -> None:
    """Mark the token used, or refuse it. Call before issuing new tokens."""
    if await revoke(db, claims, raw_token, "rotated"):
        return
    row = (await db.execute(
        text("SELECT reason, revoked_at FROM revoked_refresh_tokens WHERE jti = :jti"),
        {"jti": token_key(claims, raw_token)},
    )).one()
    age = (datetime.now(timezone.utc) - row.revoked_at).total_seconds()
    if row.reason == "rotated" and age <= GRACE_SECONDS:
        return  # a second tab refreshing at the same moment
    if row.reason == "rotated":
        # Used again long after it was replaced: someone else has a copy.
        await end_all_sessions(UUID(str(claims["sub"])))
    raise InvalidTokenError("Your session has ended. Please sign in again.")
