# app/services/ai_client.py
# One Anthropic client for every AI feature, so connections are reused and
# a slow reply gives up after 30 seconds instead of holding a request open.

from anthropic import AsyncAnthropic

from app.core.config import settings

AI_TIMEOUT_SECONDS = 30.0
AI_MAX_RETRIES = 2

_client: AsyncAnthropic | None = None


def get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        _client = AsyncAnthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            timeout=AI_TIMEOUT_SECONDS,
            max_retries=AI_MAX_RETRIES,
        )
    return _client
