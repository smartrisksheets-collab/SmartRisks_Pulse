# app/services/ai_incident.py

import logging
import re
from datetime import datetime, timezone
from uuid import UUID

from anthropic import AsyncAnthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ResourceNotFoundError
from app.models.incident import Incident
from app.schemas.incident import AIIncidentResponse, AIIncidentSuggestResponse
from app.services.settings import get_ai_config

logger = logging.getLogger(__name__)

_MAX_TOKENS = 120
_MAX_WORDS  = 20

_VALID_CATEGORIES = [
    'Cybersecurity', 'IT Operations', 'Physical Security',
    'Data Protection', 'Compliance', 'Other',
]
_VALID_SEVERITIES = ['Low', 'Medium', 'High', 'Very High']

_IMPACT_SYSTEM = (
    'You are SmartRisk AI for incident management. '
    'Write a single sentence summarizing incident impact. '
    'Plain text only. No markdown, no bullets, no headings.'
)
_ACTIONS_SYSTEM = (
    'You are SmartRisk AI for incident management. '
    'Write a single sentence recommending corrective actions. '
    'Plain text only. No markdown, no bullets, no headings.'
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _enforce_word_count(text: str) -> str:
    text = re.sub(r'[*_`#>\-]+', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    words = text.split()
    if len(words) > _MAX_WORDS:
        text = ' '.join(words[:_MAX_WORDS]).rstrip(',:;') + '.'
    return text


def _build_impact_prompt(inc: Incident) -> str:
    return '\n'.join([
        f'Incident ID: {inc.id}',
        f'Category: {inc.category or ""}',
        f'Severity: {inc.severity or ""}',
        f'Status: {inc.status or ""}',
        f'System/Location: {inc.location or ""}',
        f'Affected Asset: {inc.affected_asset or ""}',
        f'Description: {inc.description or ""}',
        f'Immediate Actions: {inc.immediate_actions or ""}',
        f'Financial Impact: {inc.financial_impact or ""}',
        '',
        'Write ONE sentence summarizing incident impact in 15 to 20 words.',
        'No bullet points. No markdown. Plain text only.',
    ])


def _build_actions_prompt(inc: Incident) -> str:
    return '\n'.join([
        f'Incident ID: {inc.id}',
        f'Category: {inc.category or ""}',
        f'Severity: {inc.severity or ""}',
        f'Status: {inc.status or ""}',
        f'Description: {inc.description or ""}',
        f'Resolution Summary: {inc.resolution_summary or ""}',
        f'Analyst Notes: {inc.analyst_notes or ""}',
        '',
        'Write ONE sentence recommending corrective actions in 15 to 20 words.',
        'No bullet points. No markdown. Plain text only.',
    ])


async def _call_api(system: str, prompt: str, model: str) -> str:
    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = await client.messages.create(
        model=model,
        max_tokens=_MAX_TOKENS,
        system=system,
        messages=[{'role': 'user', 'content': prompt}],
    )
    return _enforce_word_count(message.content[0].text.strip())


# ── Public API ────────────────────────────────────────────────────────────────

async def generate_impact(
    db: AsyncSession,
    tenant_id: UUID,
    incident_id: str,
    force: bool = False,
) -> AIIncidentResponse:
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError('ANTHROPIC_API_KEY is not configured')

    ai_cfg = await get_ai_config(db, tenant_id)
    if not ai_cfg['enabled']:
        raise ValueError('AI is disabled for this workspace.')

    result = await db.execute(
        select(Incident)
        .where(Incident.tenant_id == tenant_id)
        .where(Incident.id == incident_id)
        .where(Incident.deleted_at.is_(None))
    )
    inc = result.scalar_one_or_none()
    if not inc:
        raise ResourceNotFoundError(f'Incident {incident_id} not found')

    if inc.ai_impact and not force:
        raise ValueError('AI impact already exists. Pass force=true to overwrite.')

    system = _IMPACT_SYSTEM
    if ai_cfg['policy']:
        system = f'{system}\n\nWorkspace Policy:\n{ai_cfg["policy"]}'
    text = await _call_api(system, _build_impact_prompt(inc), ai_cfg['model'])

    inc.ai_impact = text
    inc.ai_status = 'Generated'
    inc.ai_last_generated = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(inc)

    return AIIncidentResponse(mode='impact', incident_id=incident_id, text=text)


async def generate_actions(
    db: AsyncSession,
    tenant_id: UUID,
    incident_id: str,
    force: bool = False,
) -> AIIncidentResponse:
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError('ANTHROPIC_API_KEY is not configured')

    result = await db.execute(
        select(Incident)
        .where(Incident.tenant_id == tenant_id)
        .where(Incident.id == incident_id)
        .where(Incident.deleted_at.is_(None))
    )
    inc = result.scalar_one_or_none()
    if not inc:
        raise ResourceNotFoundError(f'Incident {incident_id} not found')

    if inc.ai_actions and not force:
        raise ValueError('AI actions already exist. Pass force=true to overwrite.')

    ai_cfg = await get_ai_config(db, tenant_id)
    if not ai_cfg['enabled']:
        raise ValueError('AI is disabled for this workspace.')

    system = _ACTIONS_SYSTEM
    if ai_cfg['policy']:
        system = f'{system}\n\nWorkspace Policy:\n{ai_cfg["policy"]}'
    text = await _call_api(system, _build_actions_prompt(inc), ai_cfg['model'])

    inc.ai_actions = text
    inc.ai_status = 'Generated'
    inc.ai_last_generated = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(inc)

    return AIIncidentResponse(mode='actions', incident_id=incident_id, text=text)


async def suggest_category(
    db: AsyncSession,
    tenant_id: UUID,
    description: str,
) -> AIIncidentSuggestResponse:
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError('ANTHROPIC_API_KEY is not configured')

    ai_cfg = await get_ai_config(db, tenant_id)
    if not ai_cfg['enabled']:
        raise ValueError('AI is disabled for this workspace.')

    system = (
        'You are SmartRisk AI for incident categorization. '
        'Reply with ONLY the category name. No explanation, no punctuation.'
    )
    prompt = '\n'.join([
        f'Description: "{description}"',
        '',
        'Choose ONE category:',
        *[f'- {c}' for c in _VALID_CATEGORIES],
        '',
        'Reply with only the category name.',
    ])
    raw = await _call_api(system, prompt, ai_cfg['model'])
    raw = raw.strip().rstrip('.')
    matched = next(
        (c for c in _VALID_CATEGORIES if c.lower() == raw.lower()),
        'Other',
    )
    return AIIncidentSuggestResponse(suggestion=matched)


async def suggest_severity(
    db: AsyncSession,
    tenant_id: UUID,
    description: str,
) -> AIIncidentSuggestResponse:
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError('ANTHROPIC_API_KEY is not configured')

    ai_cfg = await get_ai_config(db, tenant_id)
    if not ai_cfg['enabled']:
        raise ValueError('AI is disabled for this workspace.')

    system = (
        'You are SmartRisk AI for severity assessment. '
        'Reply with ONLY the severity level. No explanation, no punctuation.'
    )
    prompt = '\n'.join([
        f'Description: "{description}"',
        '',
        'Choose ONE severity:',
        '- Low: minor impact, easily recoverable',
        '- Medium: moderate impact, some disruption',
        '- High: significant impact, major disruption',
        '- Very High: critical impact, business-wide disruption or data breach',
        '',
        'Reply with only the severity level.',
    ])
    raw = await _call_api(system, prompt, ai_cfg['model'])
    raw = raw.strip().rstrip('.')
    matched = next(
        (s for s in _VALID_SEVERITIES if s.lower() == raw.lower()),
        'Medium',
    )
    return AIIncidentSuggestResponse(suggestion=matched)