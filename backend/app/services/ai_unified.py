# app/services/ai_unified.py
"""
Executive brief for the unified dashboard.

Reads the same backend payload the dashboard shows, sends the model only
computed facts and record IDs, and returns short paragraphs with <b> as the
only markup. Output is escaped server-side before <b> is re-allowed.
"""

import html
import json
import logging
import re
from datetime import datetime, timezone
from uuid import UUID

from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.dashboard_brief import DashboardBrief
from app.schemas.dashboard import UnifiedBriefResponse
from app.services.brief_facts import brief_facts, facts_hash
from app.services.dashboard import get_dashboard
from app.services.settings import get_ai_config

logger = logging.getLogger(__name__)

_MAX_TOKENS = 400

_SYSTEM = """You write a short executive brief for a board-level risk dashboard.
Return ONLY the paragraphs of the brief as plain text, separated by one blank line.
No title, no preamble, no closing remarks, no lists, no JSON and no markdown.

HARD RULES:
- Exactly two paragraphs, at most 80 words in total. The reader can already see every figure on the
  dashboard, so do not recap them. Use at most three figures in the whole brief.
- Paragraph 1, at most two sentences: the single most important conclusion about this risk position, and why.
- Paragraph 2, at most two sentences: the one thing to act on first, naming the record IDs or category
  involved. If confidence is Low, end with a short clause saying the findings are indicative.
- Use only the facts provided. Never invent numbers, thresholds, dates, durations, owners or trends.
- The health score is on a 0 to 100 scale. Appetite thresholds and residual scores are on the matrix scale
  given as scale_max. Never compare the health score with an appetite threshold.
- If snapshots_held is below 2, do not describe any trend.
- Wrap only key figures and record IDs in <b></b>. No other markup. Do not use em dashes."""


def _safe(text: str) -> str:
    """Escape everything, then re-allow <b> only."""
    escaped = html.escape(text, quote=False)
    return escaped.replace("&lt;b&gt;", "<b>").replace("&lt;/b&gt;", "</b>")


def _parse(raw: str) -> list[str]:
    """Split plain-text paragraphs on blank lines. Stray fences are removed defensively."""
    cleaned = re.sub(r"^```\w*|```$", "", raw.strip()).strip()
    blocks = [re.sub(r"\s*\n\s*", " ", b).strip() for b in re.split(r"\n\s*\n", cleaned)]
    return [_safe(b) for b in blocks if b][:2]


async def generate_unified_brief(
    db: AsyncSession,
    tenant_id: UUID,
    user_email: str | None,
) -> UnifiedBriefResponse:
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY is not configured.")

    ai_cfg = await get_ai_config(db, tenant_id)
    if not ai_cfg["enabled"]:
        raise ValueError("AI is not enabled for this workspace.")

    data = await get_dashboard(db, tenant_id)
    if data.correlation.risks_total == 0 and data.correlation.incidents_total == 0:
        raise ValueError("There is no risk or incident data to summarise yet.")

    facts = brief_facts(data)
    fingerprint = facts_hash(facts)

    system = _SYSTEM
    if ai_cfg.get("policy"):
        system = f"{system}\n\nWorkspace Policy:\n{ai_cfg['policy']}"

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    try:
        msg = await client.messages.create(
            model=ai_cfg["model"],
            max_tokens=_MAX_TOKENS,
            system=system,
            messages=[{"role": "user", "content": json.dumps(facts, indent=2)}],
        )
        raw = msg.content[0].text.strip()
    except Exception as exc:
        logger.error("ai_unified.generate_unified_brief failed: %s", exc)
        raise ValueError("The executive brief is temporarily unavailable.") from exc

    try:
        paragraphs = _parse(raw)
    except Exception as exc:
        logger.error("ai_unified parse failed: %s | raw: %s", exc, raw[:200])
        raise ValueError("The executive brief could not be read. Please try again.") from exc

    if not paragraphs:
        raise ValueError("The executive brief came back empty. Please try again.")

    now = datetime.now(timezone.utc)
    row = await db.get(DashboardBrief, tenant_id)
    if row is None:
        row = DashboardBrief(tenant_id=tenant_id)
        db.add(row)
    row.paragraphs = paragraphs        # type: ignore[assignment]
    row.facts_hash = fingerprint       # type: ignore[assignment]
    row.generated_at = now             # type: ignore[assignment]
    row.generated_by = user_email      # type: ignore[assignment]
    await db.flush()

    return UnifiedBriefResponse(
        paragraphs=paragraphs,
        generated_at=now.isoformat(),
        generated_by=user_email,
        stale=False,
    )