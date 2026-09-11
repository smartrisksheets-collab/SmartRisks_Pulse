# app/services/ai_report.py
"""
AI narrative generation for Report Builder blocks.
Translates Reportservice.gs api_generateReportNarrative() and
generateBlockNarrative_() to Python using the Anthropic SDK.

Source: Reportservice.gs lines 1215-1458.
"""

from __future__ import annotations

import logging
from uuid import UUID

from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.settings import get_ai_config

logger = logging.getLogger(__name__)

_MAX_TOKENS = 400

_CONFIDENCE_TEMPERATURE: dict[str, float] = {
    "conservative": 0.3,
    "balanced":     0.5,
    "assertive":    0.7,
}

# Recommendations are now fully deterministic (owners and triggers from the register).
# AI must not choose owners, priorities, or due dates.
_AI_BLOCKS = {
    "ai-exec-summary",
    "executive-commentary",
    "top-risks",
    "top-emerging-risks",
    "major-incidents",
    "executive-dashboard",
}

_FORMATTING_RULES = "\n".join([
    "FORMATTING RULES:",
    "- Plain text only. No markdown. No bullets. No numbered lists.",
    "- Do NOT use *, **, -, or any decorative symbols.",
    "- Output must be clean plain text suitable for direct document rendering.",
    "- Never describe what charts or tables show. Synthesise, assess, and direct.",
    "- Do not present raw scores, counts, or metrics as standalone conclusions. "
      "Translate every data point into its business consequence, strategic implication, "
      "or organisational risk.",
])

_EVIDENCE_RULES = "\n".join([
    "EVIDENCE RULES — MANDATORY — THESE OVERRIDE ALL OTHER INSTRUCTIONS:",
    "- The supplied facts are authoritative. Do not calculate alternative figures.",
    "- Do not introduce owners, dates, percentages, trends, sectors, regulations,",
    "  financial impacts, or causal explanations absent from the supplied evidence.",
    "- Do not create owners. Do not create due dates. Do not create risk IDs.",
    "- Do not create incident counts.",
    "- If evidence is missing, state that the evidence is unavailable.",
    "- Never complete a story by guessing.",
])


def _guard_rules(fs: dict) -> str:
    """Dynamic guard instructions based on the facts slice flags.
    Prepended to every system prompt before _call is invoked."""
    lines: list[str] = ["GUARD RULES (derived from this report's evidence):"]
    if not fs.get("allow_trends", True):
        lines.append(
            "- allow_trends is FALSE. Do NOT use trend language: increased, decreased, "
            "improved, deteriorated, worsening, improving, over the period, "
            "compared with last period, month-over-month, or directional arrows (▲ ▼)."
        )
    if not fs.get("allow_percentages", True):
        lines.append(
            "- allow_percentages is FALSE. Do NOT use percentage framing. "
            "State counts and totals only, e.g. '3 of 4 risks', never '75% of risks'."
        )
    if not fs.get("incidents_enabled", True):
        lines.append(
            "- incidents_enabled is FALSE. Do NOT reference incidents in any form."
        )
    return "\n".join(lines)


async def _call(client: AsyncAnthropic, system: str, user: str, model: str, temperature: float = 0.5) -> str:
    """Single Anthropic call. Returns text or a safe fallback on failure."""
    try:
        msg = await client.messages.create(
            model=model,
            max_tokens=_MAX_TOKENS,
            temperature=temperature,
            system=system + "\n\n" + _FORMATTING_RULES + "\n\n" + _EVIDENCE_RULES,
            messages=[{"role": "user", "content": user}],
        )
        return (msg.content[0].text or "").strip()
    except Exception as exc:
        logger.error("ai_report._call failed: %s", exc)
        return "AI narrative unavailable. Data is saved — you can regenerate later."


def _build_prompt(
    block_key: str,
    block_data: dict,
    org: str,
    industry: str,
    facts_slice: dict,
) -> tuple[str, str] | None:
    """
    Returns (system_prompt, user_prompt) for the given block.
    Returns None if the block is not AI-capable.
    facts_slice provides the authoritative evidence guards and pre-computed values.
    """
    import json

    ind = f" in the {industry} industry" if industry else ""
    fs  = facts_slice  # authoritative fact slice

    # Dynamic guard instructions prepended to every system prompt
    guards = _guard_rules(fs)

    ei  = block_data.get("exposure-index", {})
    rs  = block_data.get("risk-snapshot", {})
    krc = block_data.get("key-risk-changes", {})
    is_ = block_data.get("incident-stability", {})
    tr  = block_data.get("top-risks", {})
    ter = block_data.get("top-emerging-risks", {})
    mi  = block_data.get("major-incidents", {})

    if block_key == "ai-exec-summary":
        data = {
            "allow_trends":      fs.get("allow_trends"),
            "allow_percentages": fs.get("allow_percentages"),
            "exposure": {
                "score": fs.get("scores", {}).get("exposure_index"),
                "label": ei.get("label"),
                "health": fs.get("scores", {}).get("risk_health"),
            },
            "risks": {
                "total":        fs.get("counts", {}).get("active"),
                "elevated":     fs.get("counts", {}).get("elevated"),
                "avg_residual": fs.get("scores", {}).get("avg_residual"),
                "by_treatment": rs.get("by_treatment"),
            },
            "governance": fs.get("governance", {}),
        }
        system = (
            f"You are a seasoned Chief Risk Officer presenting to the board of {org}{ind}. "
            "Your words drive decisions, not just inform. Every sentence must carry strategic weight.\n\n"
            + guards
        )
        user = (
            f"Write exactly 3 sentences on the current risk posture of {org}.\n"
            "Sentence 1: State what the exposure level signals about control strength and protection of strategic objectives.\n"
            "Sentence 2: Identify the single most dangerous concentration or pattern and why it demands leadership attention now.\n"
            "Sentence 3: State the most critical action the organisation must take this period and the consequence of inaction.\n"
            "Do not describe the data. Assess it and direct leadership.\n\n"
            f"Authoritative evidence:\n{json.dumps(data, indent=2)}"
        )
        return system, user

    if block_key == "executive-commentary":
        data = {
            "allow_trends":      fs.get("allow_trends"),
            "allow_percentages": fs.get("allow_percentages"),
            "exposure_index":    fs.get("scores", {}).get("exposure_index"),
            "exposure_label":    ei.get("label"),
            "elevated_count":    fs.get("counts", {}).get("elevated"),
            "total_risks":       fs.get("counts", {}).get("active"),
            "avg_residual":      fs.get("scores", {}).get("avg_residual"),
            "governance":        fs.get("governance", {}),
            "assurance":         fs.get("assurance", {}),
        }
        system = (
            f"You are the Chief Risk Officer of {org}{ind}. "
            "You write with authority, precision, and strategic intent.\n\n"
            + guards
        )
        user = (
            "Write a structured commentary using EXACTLY this format:\n\n"
            "Observation: [1-2 sentences. The sharpest strategic truth the data reveals "
            f"about {org}'s risk position — what it means for the business, not the numbers.]\n\n"
            "Impact: [1-2 sentences. The operational, financial, or strategic consequence "
            f"if the current trajectory continues. Be direct about what is at stake for {org}.]\n\n"
            "Recommended Focus: [1 sentence. The single highest-leverage action leadership "
            "must prioritise this period and what it will prevent or unlock.]\n\n"
            "Rules: Use exactly the three labels. Each section starts with its label and a colon. "
            "Do not add other sections.\n\n"
            f"Authoritative evidence:\n{json.dumps(data, indent=2)}"
        )
        return system, user

    if block_key == "top-risks":
        pruned = [
            {
                "id":             r.get("id"),
                "description":    r.get("desc"),
                "level":          r.get("level"),
                "residual":       r.get("residual"),
                "treatment":      r.get("treatment"),
                "appetite_status": r.get("appetite_status"),
            }
            for r in (tr.get("risks") or [])[:5]
        ]
        data = {
            "allow_trends":      fs.get("allow_trends"),
            "allow_percentages": fs.get("allow_percentages"),
            "risks":             pruned,
        }
        system = (
            f"You are a senior risk advisor at {org}{ind}. "
            "You identify what is most dangerous and what must be done, not what exists.\n\n"
            + guards
        )
        user = (
            f"Write 2-3 sentences on the top risks below. Each sentence must carry a clear "
            "strategic implication or urgency signal.\n"
            f"Do not list or describe risks. Assess the combined exposure they create and what it means for {org}.\n"
            "Use [RISK] at the start of sentences identifying a critical exposure or control gap.\n"
            "Use [OBSERVATION] at the start of sentences identifying a dangerous pattern across multiple risks.\n\n"
            f"Authoritative evidence:\n{json.dumps(data, indent=2)}"
        )
        return system, user

    if block_key == "top-emerging-risks":
        pruned = [
            {"id": r.get("id"), "description": r.get("desc"), "level": r.get("level")}
            for r in (ter.get("risks") or [])[:5]
        ]
        data = {
            "allow_trends":      fs.get("allow_trends"),
            "allow_percentages": fs.get("allow_percentages"),
            "risks":             pruned,
            "created_in_period": fs.get("counts", {}).get("created_in_period"),
        }
        system = (
            f"You are a senior risk strategist at {org}{ind}. "
            "You see around corners. Your job is to tell leadership what is coming before it arrives.\n\n"
            + guards
        )
        user = (
            f"Write 2-3 sentences on these emerging risks. Focus on future consequence "
            f"and the window {org} has to act before these become critical.\n"
            "Do not describe the risks. State what they threaten and what early action would prevent.\n"
            "Use [RISK] at the start of sentences signalling an emerging threat with high future impact.\n"
            "Use [OBSERVATION] at the start of sentences identifying a converging vulnerability.\n\n"
            f"Authoritative evidence:\n{json.dumps(data, indent=2)}"
        )
        return system, user

    if block_key == "major-incidents":
        pruned = [
            {"id": i.get("id"), "description": i.get("desc"),
             "severity": i.get("severity"), "status": i.get("status")}
            for i in (mi.get("incidents") or [])[:5]
        ]
        data = {
            "allow_trends":     fs.get("allow_trends"),
            "incidents_enabled": fs.get("incidents_enabled"),
            "incidents":        pruned,
        }
        system = (
            f"You are a senior operational risk advisor at {org}{ind}. "
            "You diagnose control failures and tell leadership what they reveal about systemic weaknesses.\n\n"
            + guards
        )
        user = (
            f"Write 2-3 sentences on what these incidents collectively expose about {org}'s "
            "control environment and operational resilience.\n"
            "Do not recount what happened. Assess what the pattern reveals and what leadership must address.\n"
            "Use [OBSERVATION] at the start of sentences identifying a systemic pattern or control gap.\n"
            "Use [RISK] at the start of sentences stating the operational or strategic exposure "
            f"this creates for {org}.\n\n"
            f"Authoritative evidence:\n{json.dumps(data, indent=2)}"
        )
        return system, user

    if block_key == "executive-dashboard":
        data = {
            "allow_trends":      fs.get("allow_trends"),
            "allow_percentages": fs.get("allow_percentages"),
            "incidents_enabled": fs.get("incidents_enabled"),
            "exposure_label":    ei.get("label"),
            "exposure_index":    fs.get("scores", {}).get("exposure_index"),
            "elevated_count":    fs.get("counts", {}).get("elevated"),
            "total_risks":       fs.get("counts", {}).get("active"),
            "breach_count":      fs.get("governance", {}).get("breach_count", 0),
            "governance":        fs.get("governance", {}),
        }
        system = (
            f"You are a Chief Risk Officer briefing the leadership team of {org}{ind}. "
            "Your job is to communicate what the risk data means for the business, not to recite it.\n\n"
            + guards
        )
        user = (
            "Write exactly 3 to 4 short, standalone sentences for a leadership briefing panel "
            "titled 'What Leadership Needs To Know'.\n"
            "Each sentence must communicate a distinct business consequence, strategic implication, or decision prompt.\n"
            f"Do not state scores, counts, or percentages. Translate the data into what it means "
            f"for {org}'s ability to protect its objectives and manage its exposure.\n"
            "Each sentence goes on its own line. No labels, no numbering, no preamble.\n\n"
            f"Authoritative evidence:\n{json.dumps(data, indent=2)}"
        )
        return system, user

    return None


async def generate_report_narrative(
    db: AsyncSession,
    tenant_id: UUID,
    block_data: dict,
    blocks: list[str],
    org_name: str,
    industry: str,
    facts_slice: dict,
) -> dict[str, str | None]:
    """
    Generates AI narratives for all AI-capable blocks in the request.
    facts_slice provides the authoritative evidence guards (allow_trends,
    allow_percentages, etc.) that constrain every prompt.
    Returns a dict of {block_key: narrative_text}.
    """
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY is not configured")

    ai_cfg = await get_ai_config(db, tenant_id)
    if not ai_cfg['enabled']:
        raise ValueError('AI is disabled for this workspace.')

    model       = ai_cfg['model']
    temperature = _CONFIDENCE_TEMPERATURE.get(ai_cfg['confidence'], 0.5)

    policy_parts: list[str] = []
    if ai_cfg['policy']:
        policy_parts.append(ai_cfg['policy'])
    if ai_cfg['policy_industry']:
        policy_parts.append(f"Industry context: {ai_cfg['policy_industry']}")
    if ai_cfg['policy_tone']:
        policy_parts.append(f"Tone: {ai_cfg['policy_tone']}")
    if ai_cfg['policy_sensitivity']:
        policy_parts.append(f"Sensitivity: {ai_cfg['policy_sensitivity']}")
    if ai_cfg['policy_extra']:
        policy_parts.append(ai_cfg['policy_extra'])
    combined_policy = "\n".join(policy_parts)

    ai_blocks = [b for b in blocks if b in _AI_BLOCKS]
    if not ai_blocks:
        return {}

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    results: dict[str, str | None] = {}

    import asyncio

    async def _generate_one(key: str) -> tuple[str, str | None]:
        prompt = _build_prompt(key, block_data, org_name, industry, facts_slice)
        if prompt is None:
            return key, None
        system_p, user_p = prompt
        if combined_policy:
            system_p = f'{system_p}\n\nWorkspace Policy:\n{combined_policy}'
        text = await _call(client, system_p, user_p, model, temperature)
        return key, text

    tasks = [_generate_one(k) for k in ai_blocks]
    completed = await asyncio.gather(*tasks)
    for key, text in completed:
        results[key] = text

    return results