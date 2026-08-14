# app/services/ai_risk.py

import asyncio
import logging
import re
from uuid import UUID

from anthropic import AsyncAnthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ResourceNotFoundError
from app.models.risk import Risk
from app.models.audit_log import AuditLog
from app.schemas.risk import AIInsightRequest, AIInsightResponse
from app.services.settings import get_ai_config

logger = logging.getLogger(__name__)

_MAX_TOKENS  = 120
_CONCURRENCY = 3
_MIN_WORDS   = 15
_MAX_WORDS   = 20

_CONFIDENCE_LINES = {
    'conservative': 'Be cautious. Recommend safe, proven, low-risk corrective actions.',
    'balanced':     'Be practical. Recommend realistic, achievable corrective actions.',
    'assertive':    'Be direct. Recommend bold, decisive corrective actions.',
}

_BASE_SYSTEM = (
    'You are SmartRisk AI. Write a single corrective action insight for a risk '
    'register entry. Plain text only. No markdown, no bullets, no headings.'
)


def _build_system(policy: str) -> str:
    if policy:
        return f'{_BASE_SYSTEM}\n\nWorkspace Policy:\n{policy}'
    return _BASE_SYSTEM


# ── Helpers ───────────────────────────────────────────────────────────────────

def _derive_status(level: str | None, residual: float) -> str:
    lvl = (level or '').lower()
    if lvl == 'critical' or residual >= 17:
        return 'Escalate'
    if lvl == 'high' or residual >= 10:
        return 'Monitor'
    if lvl == 'medium':
        return 'Review'
    return 'Stable'


def _enforce_word_count(text: str) -> str:
    # Strip markdown artifacts
    text = re.sub(r'[*_`#>\-]+', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    words = text.split()
    if len(words) > _MAX_WORDS:
        words = words[:_MAX_WORDS]
        text = ' '.join(words).rstrip(',:;') + '.'
    if len(words) < _MIN_WORDS:
        tail = (
            ' Assign an owner, set a deadline, validate controls, '
            'and track progress until residual risk is reduced.'
        )
        text = (text.rstrip('.') + tail).strip()
        words = text.split()
        if len(words) > _MAX_WORDS:
            text = ' '.join(words[:_MAX_WORDS]).rstrip(',:;') + '.'
    return text


def _build_prompt(risk: Risk, confidence: str, notes: str | None) -> str:
    lines = [
        f'Risk ID: {risk.id}',
        f'Category: {risk.category or ""}',
        f'Owner: {risk.owner or ""}',
        f'Description: {risk.description or ""}',
        f'Primary Impact: {risk.primary_impact or ""}',
        f'Likelihood: {risk.likelihood}',
        f'Impact Score: {risk.impact_score}',
        f'Severity: {risk.severity}',
        f'Risk Level: {risk.level or ""}',
        f'Treatment: {risk.treatment or ""}',
        f'Existing Controls: {risk.controls or ""}',
        f'Control Effectiveness: {risk.control_effectiveness}%',
        f'Residual Score: {risk.residual}',
        f'Mitigation Plan: {risk.mitigation_plan or ""}',
        f'Comments: {risk.comments or ""}',
        '',
        _CONFIDENCE_LINES.get(confidence, _CONFIDENCE_LINES['balanced']),
    ]
    if notes:
        lines.append(f'User Notes: {notes}')
    lines += [
        '',
        'Output rules (follow exactly):',
        f'- {_MIN_WORDS} to {_MAX_WORDS} words total',
        '- One paragraph only',
        '- No title, headings, labels, bullets, or markdown',
        '- Include a clear corrective action the owner should take next',
    ]
    return '\n'.join(lines)


async def _call_api(
    client: AsyncAnthropic,
    sem: asyncio.Semaphore,
    risk: Risk,
    confidence: str,
    notes: str | None,
    model: str,
    system: str,
) -> tuple[str, str | None]:
    """Returns (risk_id, insight_text | None). None means the call failed."""
    async with sem:
        try:
            message = await client.messages.create(
                model=model,
                max_tokens=_MAX_TOKENS,
                system=system,
                messages=[{'role': 'user', 'content': _build_prompt(risk, confidence, notes)}],
            )
            raw     = message.content[0].text.strip()
            insight = _enforce_word_count(raw)
            status  = _derive_status(risk.level, float(risk.residual or 0)) # type: ignore
            conf_label = confidence.capitalize()
            return risk.id, f'{insight}\nConfidence: {conf_label}\nStatus: {status}'
        except Exception as exc:
            logger.error('ai_risk._call_api failed | risk=%s | %s', risk.id, exc)
            return risk.id, None


# ── Public API ────────────────────────────────────────────────────────────────

async def generate_insights(
    db: AsyncSession,
    tenant_id: UUID,
    payload: AIInsightRequest,
    user_email: str,
) -> AIInsightResponse:
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError('ANTHROPIC_API_KEY is not configured')

    ai_cfg = await get_ai_config(db, tenant_id)
    if not ai_cfg['enabled']:
        raise ValueError('AI is disabled for this workspace.')

    model      = ai_cfg['model']
    confidence = payload.confidence or ai_cfg['confidence']
    system     = _build_system(ai_cfg['policy'])

    # Step 1: fetch target risks
    q = select(Risk).where(Risk.tenant_id == tenant_id)

    if payload.target == 'empty':
        q = q.where(
            (Risk.ai_insight.is_(None)) | (Risk.ai_insight == '')
        )
    elif payload.target == 'selected':
        if not payload.risk_ids:
            raise ResourceNotFoundError('risk_ids is required when target is selected')
        q = q.where(Risk.id.in_(payload.risk_ids))
    # 'all' uses no additional filter

    result  = await db.execute(q)
    risks   = result.scalars().all()

    # Filter out already-insighted risks unless overwrite is set
    if not payload.overwrite and payload.target != 'empty':
        to_process = [r for r in risks if not r.ai_insight]
        skipped    = len(risks) - len(to_process)
    else:
        to_process = list(risks)
        skipped    = 0

    if not to_process:
        return AIInsightResponse(
            updated=0, skipped=skipped, failed=0,
            updated_ids=[], failed_ids=[],
        )

    # Step 2: call Anthropic concurrently, no DB ops here
    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    sem    = asyncio.Semaphore(_CONCURRENCY)

    api_results: list[tuple[str, str | None]] = await asyncio.gather(
        *[_call_api(client, sem, r, confidence, payload.notes, model, system)
          for r in to_process]
    )

    # Step 3: write results back to DB sequentially
    result_map   = {risk_id: text for risk_id, text in api_results}
    updated_ids: list[str] = []
    failed_ids:  list[str] = []

    risk_map = {r.id: r for r in to_process}
    for risk_id, insight in result_map.items():
        if insight:
            risk_map[risk_id].ai_insight = insight
            updated_ids.append(risk_id)
        else:
            failed_ids.append(risk_id)

    if updated_ids:
        db.add(AuditLog(
            tenant_id=tenant_id,
            user_email=user_email,
            action='AI_GENERATE',
            module='Risk',
            record_id='batch',
            summary=f'AI insights generated for {len(updated_ids)} risk(s)',
        ))
        await db.flush()

    return AIInsightResponse(
        updated=len(updated_ids),
        skipped=skipped,
        failed=len(failed_ids),
        updated_ids=updated_ids,
        failed_ids=failed_ids,
    )