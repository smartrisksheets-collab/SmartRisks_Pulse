from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
from app.core.config import settings

ADMIN_TOKEN_TYPE = "admin_access"


def create_admin_token(admin_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    return jwt.encode(
        {
            "sub": admin_id,
            "role": role,
            "type": ADMIN_TOKEN_TYPE,
            "exp": expire,
        },
        settings.ADMIN_JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_admin_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.ADMIN_JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("type") != ADMIN_TOKEN_TYPE:
            return {}
        return payload
    except JWTError:
        return {}