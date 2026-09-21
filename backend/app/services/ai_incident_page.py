# app/services/ai_incident_page.py

import json
import logging
import re
from uuid import UUID

from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.schemas.incident import IncidentInsightAction, IncidentPageInsightResponse
from app.services.incident import get_stats
from app.services.settings import get_ai_config

logger = logging.getLogger(__name__)

_MAX_TOKENS = 600

_SYSTEM = """You generate incident management action items from computed metrics.
Return ONLY valid JSON — no preamble, no markdown fences — matching this exact shape:
{
  "actions": [
    {"badge": "<1-2 word imperative>", "text": "<one specific actionable sentence>"}
  ]
}

HARD RULES:
- 3 to 5 actions. Each must reference specific data from the input (IDs, counts, days).
- badge: 1-2 words, imperative. Examples: Escalate, Resolve, Reassess, Assign owner, Clear backlog, Investigate.
- text: 1 sentence, specific, no editorialising. Name incident IDs, severities, or exact counts.
- No generic advice. No "consider", "may want to", "could help".
- If a field is null or zero, skip actions that depend on it.
- Bold ONLY numeric values with <strong> tags. No other HTML."""


def _build_prompt(stats) -> str:  # type: ignore[no-untyped-def]
    h = stats.health
    t = stats.totals
    r = stats.resolution
    breach_count = t.count - h.within_sla

    payload: dict = {
        "health_score":         h.score,
        "health_label":         h.label,
        "total":                t.count,
        "open":                 t.open_count,
        "overdue":              t.overdue_count,
        "sla_breaches":         breach_count,
        "linked_to_risk":       h.linked,
        "unlinked":             t.count - h.linked,
        "open_over_150d":       t.open_over_150d,
        "high_or_above":        t.high_or_above,
    }
    if r.oldest_open_id:
        payload["oldest_open_id"]       = r.oldest_open_id
        payload["oldest_open_days"]     = r.oldest_open_days
        payload["oldest_open_severity"] = r.oldest_open_severity
    if r.flag:
        payload["worst_overrun"] = r.flag

    return json.dumps({k: v for k, v in payload.items() if v is not None and v != 0}, indent=2)


def _parse(raw: str) -> list[IncidentInsightAction]:
    raw = raw.strip()
    raw = re.sub(r'^```(?:json)?', '', raw).rstrip('`').strip()
    parsed = json.loads(raw)
    return [
        IncidentInsightAction(badge=str(a['badge']), text=str(a['text']))
        for a in parsed.get('actions', [])
    ]


async def generate_page_insights(
    db: AsyncSession,
    tenant_id: UUID,
) -> IncidentPageInsightResponse:
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError('ANTHROPIC_API_KEY is not configured.')

    ai_cfg = await get_ai_config(db, tenant_id)
    if not ai_cfg['enabled']:
        raise ValueError('AI is not enabled for this workspace.')

    stats = await get_stats(db, tenant_id)

    system = _SYSTEM
    if ai_cfg.get('policy'):
        system = f"{system}\n\nWorkspace Policy:\n{ai_cfg['policy']}"

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    try:
        msg = await client.messages.create(
            model=ai_cfg['model'],
            max_tokens=_MAX_TOKENS,
            system=system,
            messages=[{'role': 'user', 'content': _build_prompt(stats)}],
        )
        raw = msg.content[0].text.strip()
    except Exception as exc:
        logger.error('ai_incident_page.generate_page_insights failed: %s', exc)
        raise ValueError('Incident insights are temporarily unavailable.') from exc

    try:
        actions = _parse(raw)
    except Exception as exc:
        logger.error('ai_incident_page parse failed: %s | raw: %s', exc, raw[:200])
        raise ValueError('Failed to parse incident insights response.') from exc

    return IncidentPageInsightResponse(actions=actions)