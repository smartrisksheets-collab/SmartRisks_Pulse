"""
Gap map batch 6: PyJWT replaces python-jose, one shared AI client with a
timeout, and the unused supabase package is gone.
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt

from app.core.admin_security import create_admin_token, decode_admin_token
from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.services import ai_client


def test_tokens_round_trip_with_pyjwt() -> None:
    tok = create_access_token({"sub": "a1", "email": "a@example.com"})
    assert decode_token(tok)["sub"] == "a1"
    assert decode_token(create_refresh_token("a1", 3))["token_version"] == 3
    assert decode_admin_token(create_admin_token("ad1", "super_admin"))["role"] == "super_admin"


def test_bad_tokens_decode_to_nothing() -> None:
    expired = jwt.encode({"sub": "a1", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
                         settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    forged = jwt.encode({"sub": "a1"}, "x" * 40, algorithm=settings.JWT_ALGORITHM)
    assert decode_token(expired) == {}
    assert decode_token(forged) == {}
    assert decode_token("not-a-token") == {}
    # a user token is never an admin token, and the reverse
    assert decode_admin_token(create_access_token({"sub": "a1"})) == {}
    assert decode_token(create_admin_token("ad1", "super_admin")) == {}


def test_ai_client_is_shared_with_timeout_and_retries() -> None:
    first = ai_client.get_client()
    assert ai_client.get_client() is first
    assert first.timeout == 30.0
    assert first.max_retries == 2


def test_requirements_drop_jose_and_supabase() -> None:
    req = (Path(__file__).resolve().parents[1] / "requirements.txt").read_text().lower()
    assert "python-jose" not in req
    assert "supabase" not in req
    assert "pyjwt==" in req
