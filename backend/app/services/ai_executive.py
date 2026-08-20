# app/services/ai_executive.py

import json
import logging
import re
from collections import Counter
from uuid import UUID

from anthropic import AsyncAnthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.risk import Risk

from app.core.config import settings
from app.schemas.dashboard import ActionItem, ExecInsightResponse
from app.services.dashboard import get_dashboard

logger = logging.getLogger(__name__)

_MAX_TOKENS = 700

_SYSTEM = """You generate a 4-sentence executive risk summary and a matching action plan.
Return ONLY valid JSON — no preamble, no markdown fences — matching this exact shape:
{
  "summary": "<sentences joined in one string, numbers wrapped in <strong> tags>",
  "action_items": [
    {"sentence_num": 1, "source_label": "From: <exact fact from sentence 1>", "title": "<specific action>", "done_when": "<measurable criterion>"},
    {"sentence_num": 2, "source_label": "...", "title": "...", "done_when": "..."},
    {"sentence_num": 3, "source_label": "...", "title": "...", "done_when": "..."},
    {"sentence_num": 4, "source_label": "...", "title": "...", "done_when": "..."}
  ]
}

HARD RULES:
- summary: maximum 50 words total across all sentences. Count before returning.
- Sentence 1: trend direction and magnitude — use the words spike/decline/reversal/flat — include from-score, to-score, and months.
- Sentence 2: top named risk by ID, short title, score and severity.
- Sentence 3: exposure-reduced count and the category it is concentrated in.
- Sentence 4: percentage of active risks rated High or Very High, and whether that is unchanged/up/down vs prior period.
- Bold ONLY numeric values using <strong> tags. No other bolding.
- No editorializing. No phrases like worth checking, consider, may indicate, if an auditor.
- Never mention control effectiveness, audit readiness, or governance maturity.
- If any input field is null, omit that sentence entirely and omit its matching action item.
- action_items: one item per summary sentence only. sentence_num must match the sentence position in the output (1-indexed, gaps allowed).
- action titles must be specific to the data provided, not generic risk advice.
- done_when must be measurable — never vague like improve security posture."""


def _derive_inputs(data) -> dict:  # type: ignore[type-arg]
    """Derive the structured input dict from a DashboardResponse object."""
    trend = data.residual_trend
    if len(trend) >= 2:
        start, end = trend[0], trend[-1]
        delta = end.avg - start.avg
        if delta > 1.5:
            direction = 'spike'
        elif delta < -1.5:
            direction = 'decline'
        elif abs(delta) > 0.3:
            direction = 'reversal'
        else:
            direction = 'flat'
        trend_inputs: dict = {
            'trend_start_score': round(start.avg, 1),
            'trend_start_month': start.label,
            'trend_end_score':   round(end.avg, 1),
            'trend_end_month':   end.label,
            'trend_direction':   direction,
        }
    else:
        trend_inputs = {
            'trend_start_score': None, 'trend_start_month': None,
            'trend_end_score': None, 'trend_end_month': None,
            'trend_direction': None,
        }

    top = data.top_risks[0] if data.top_risks else None
    top_inputs: dict = {
        'top_risk_id':       top.id if top else None,
        'top_risk_title':    top.description if top else None,
        'top_risk_score':    round(top.residual) if top and top.residual is not None else None,
        'top_risk_severity': top.level if top else None,
    }

    # Exposure reductions: score_change where old > new, deduplicated by risk_id
    reductions = [
        e for e in data.activity_feed
        if e.action_type == 'score_change'
        and e.old_value is not None
        and e.new_value is not None
        and e.old_value > e.new_value
    ]
    seen: set[str] = set()
    unique_reductions = []
    for e in reductions:
        key = e.risk_id or e.id
        if key not in seen:
            seen.add(key)
            unique_reductions.append(e)

    exp_count = len(unique_reductions) if unique_reductions else None
    if unique_reductions:
        cats = [e.category for e in unique_reductions if e.category]
        top_cat = Counter(cats).most_common(1)[0][0] if cats else None
    else:
        top_cat = None

    kpis = data.kpis
    pct_high = round((kpis.high_risks / kpis.total_risks) * 100) if kpis.total_risks > 0 else None
    delta_obj = data.snapshot_delta
    if delta_obj.has_data and delta_obj.high_risk_count is not None:
        if delta_obj.high_risk_count > 0:
            pct_trend = 'up'
        elif delta_obj.high_risk_count < 0:
            pct_trend = 'down'
        else:
            pct_trend = 'unchanged'
    else:
        pct_trend = 'unchanged'

    return {
        **trend_inputs,
        **top_inputs,
        'exposure_reduced_count':        exp_count,
        'exposure_reduced_top_category': top_cat,
        'pct_high_or_very_high':         pct_high,
        'pct_trend':                     pct_trend,
    }


def _count_words(text: str) -> int:
    return len(re.sub(r'<[^>]+>', '', text).split())


def _parse_response(raw: str) -> tuple[str, list[ActionItem]]:
    raw = raw.strip()
    raw = re.sub(r'^```(?:json)?', '', raw).rstrip('`').strip()
    parsed = json.loads(raw)
    summary = str(parsed.get('summary', ''))
    items = [
        ActionItem(
            sentence_num=int(i['sentence_num']),
            source_label=str(i['source_label']),
            title=str(i['title']),
            done_when=str(i['done_when']),
        )
        for i in parsed.get('action_items', [])
    ]
    return summary, items


async def generate_exec_insight(
    db: AsyncSession,
    tenant_id: UUID,
    days: int = 90,
) -> ExecInsightResponse:
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError('ANTHROPIC_API_KEY is not configured.')

    data = await get_dashboard(db, tenant_id, days=days)
    inputs = _derive_inputs(data)

    owners_rows = await db.execute(
        select(Risk.owner)
        .where(Risk.tenant_id == tenant_id, Risk.deleted_at.is_(None), Risk.owner.isnot(None))
        .distinct()
    )
    owners = sorted([str(r) for r in owners_rows.scalars().all() if r])

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = await client.messages.create(
        model='claude-haiku-4-5-20251001',
        max_tokens=_MAX_TOKENS,
        system=_SYSTEM,
        messages=[{'role': 'user', 'content': json.dumps(inputs, indent=2)}],
    )

    raw = message.content[0].text.strip()
    try:
        summary, action_items = _parse_response(raw)
    except Exception as exc:
        logger.error('exec_insight parse failed: %s | raw: %s', exc, raw[:200])
        raise ValueError('Failed to parse executive insight response.') from exc

    return ExecInsightResponse(
        summary=summary,
        action_items=action_items,
        word_count=_count_words(summary),
        owners=owners,
    )