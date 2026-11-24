from datetime import datetime, timedelta, timezone

import uuid

import bcrypt # type: ignore
from jose import jwt, JWTError
from app.core.config import settings


def _bcrypt_input(plain: str) -> bytes:
    """bcrypt reads at most 72 bytes. bcrypt 4 cut longer input silently and
    bcrypt 5 raises an error. Cutting here keeps every stored hash valid and
    a long password from causing a server error, on either version."""
    return plain.encode()[:72]


def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(_bcrypt_input(pin), bcrypt.gensalt()).decode()


def verify_pin(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(_bcrypt_input(plain), hashed.encode())


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_bcrypt_input(plain), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(_bcrypt_input(plain), hashed.encode())


# A real bcrypt hash of a throwaway value, at the same cost as stored hashes.
_DUMMY_HASH = "$2b$12$skBtdgUoc5sZJBoZBXAfLu0vtCqO4zO9QS3kACJ7TQyfTXCdhOanq"


def burn_password_check(plain: str) -> None:
    """Spend the same time as a real check when there is no hash to check.

    Sign-in for an unknown email would otherwise reply faster, which tells a
    caller which emails have accounts.
    """
    bcrypt.checkpw(_bcrypt_input(plain), _DUMMY_HASH.encode())


def create_reset_token(account_id: str, email: str, token_version: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    return jwt.encode(
        {"sub": account_id, "email": email, "type": "reset", "ver": token_version, "exp": expire},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    to_encode["type"] = "access"
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(
    account_id: str,
    token_version: int,
    active_tenant_id: str | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {
            "sub": account_id,
            "exp": expire,
            "type": "refresh",
            "jti": uuid.uuid4().hex,   # makes each token single use (services/refresh_tokens.py)
            "token_version": token_version,
            "active_tenant_id": active_tenant_id,
        },
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return {}