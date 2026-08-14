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

_MAX_TOKENS  = 400
_TEMPERATURE = 0.5

# Blocks that support AI narrative generation — matches GAS AI_KEYS list
_AI_BLOCKS = {
    "ai-exec-summary",
    "executive-commentary",
    "top-risks",
    "top-emerging-risks",
    "major-incidents",
    "recommendations",
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


async def _call(client: AsyncAnthropic, system: str, user: str, model: str) -> str:
    """Single Anthropic call. Returns text or a safe fallback on failure."""
    try:
        msg = await client.messages.create(
            model=model,
            max_tokens=_MAX_TOKENS,
            system=system + "\n\n" + _FORMATTING_RULES,
            messages=[{"role": "user", "content": user}],
        )
        return (msg.content[0].text or "").strip()
    except Exception as exc:
        logger.error("ai_report._call failed: %s", exc)
        return "AI narrative unavailable. Data is saved — you can regenerate later."


def _build_prompt(block_key: str, block_data: dict, org: str, industry: str) -> tuple[str, str] | None:
    """
    Returns (system_prompt, user_prompt) for the given block.
    Returns None if the block is not AI-capable.
    Source: Reportservice.gs generateBlockNarrative_()
    """
    ind = f" in the {industry} industry" if industry else ""

    ei  = block_data.get("exposure-index", {})
    rs  = block_data.get("risk-snapshot", {})
    krc = block_data.get("key-risk-changes", {})
    is_ = block_data.get("incident-stability", {})
    tr  = block_data.get("top-risks", {})
    ter = block_data.get("top-emerging-risks", {})
    mi  = block_data.get("major-incidents", {})
    rec = block_data.get("recommendations", {})

    import json

    if block_key == "ai-exec-summary":
        data = {
            "exposure": {"score": ei.get("score"), "label": ei.get("label")},
            "risks":    {"total": rs.get("total"), "high_count": rs.get("high_count"),
                         "avg_residual": rs.get("avg_residual"), "by_treatment": rs.get("by_treatment")},
            "changes":  {"increased": krc.get("increased"), "decreased": krc.get("decreased"),
                         "new_high":  krc.get("new_high_risks")},
        }
        return (
            f"You are a seasoned Chief Risk Officer presenting to the board of {org}{ind}. "
            "Your words drive decisions, not just inform. Every sentence must carry strategic weight.",
            f"Write exactly 3 sentences on the current risk posture of {org}.\n"
            f"Sentence 1: State what the current exposure level signals about the organisation's "
            "control strength and its ability to protect strategic objectives.\n"
            "Sentence 2: Identify the single most dangerous concentration or pattern and why it "
            "demands leadership attention now.\n"
            "Sentence 3: State the most critical action the organisation must take this period "
            "and the consequence of inaction.\n"
            "Do not describe the data. Assess it and direct leadership.\n\n"
            f"Data:\n{json.dumps(data, indent=2)}",
        )

    if block_key == "executive-commentary":
        data = {
            "exposure":      {"score": ei.get("score"), "label": ei.get("label")},
            "high_risks":    rs.get("high_count"),
            "total_risks":   rs.get("total"),
            "open_incidents": is_.get("open"),
            "avg_residual":  rs.get("avg_residual"),
        }
        return (
            f"You are the Chief Risk Officer of {org}{ind}. "
            "You write with authority, precision, and strategic intent. "
            "Your commentary moves executives to act, not just reflect.",
            "Write a structured commentary using EXACTLY this format — no deviations:\n\n"
            "Observation: [1-2 sentences. State the sharpest strategic truth the data reveals "
            f"about {org}'s risk position. Focus on what this means for the business, not the numbers themselves.]\n\n"
            "Impact: [1-2 sentences. State the operational, financial, or strategic consequence "
            f"if the current trajectory continues. Be direct about what is at stake for {org}.]\n\n"
            f"Recommended Focus: [1 sentence. Name the single highest-leverage action leadership "
            "must prioritise this period and what it will prevent or unlock.]\n\n"
            "Rules:\n"
            "- Use exactly the three labels: Observation, Impact, Recommended Focus.\n"
            "- Each section starts with its label followed by a colon.\n"
            "- Do not add any other sections or labels.\n"
            f"Data:\n{json.dumps(data, indent=2)}",
        )

    if block_key == "top-risks":
        pruned = [
            {"id": r.get("id"), "description": r.get("desc"), "level": r.get("level"),
             "residual": r.get("residual"), "treatment": r.get("treatment")}
            for r in (tr.get("risks") or [])[:5]
        ]
        return (
            f"You are a senior risk advisor at {org}{ind}. "
            "You identify what is most dangerous and what must be done, not what exists.",
            f"Write 2-3 sentences on the top risks below. Each sentence must carry a clear "
            f"strategic implication or urgency signal.\n"
            f"Do not list or describe risks. Assess the combined exposure they create and "
            f"what it means for {org} right now.\n"
            "Use [RISK] at the start of sentences identifying a critical exposure or control gap.\n"
            "Use [OBSERVATION] at the start of sentences identifying a dangerous pattern across multiple risks.\n"
            f"Top risks:\n{json.dumps(pruned, indent=2)}",
        )

    if block_key == "top-emerging-risks":
        pruned = [
            {"id": r.get("id"), "description": r.get("desc"), "level": r.get("level")}
            for r in (ter.get("risks") or [])[:5]
        ]
        return (
            f"You are a senior risk strategist at {org}{ind}. "
            "You see around corners. Your job is to tell leadership what is coming before it arrives.",
            f"Write 2-3 sentences on these emerging risks. Focus entirely on future consequence "
            f"and the window {org} has to act before these become critical.\n"
            "Do not describe the risks. State what they threaten and what early action would prevent.\n"
            "Use [RISK] at the start of sentences signalling an emerging threat with high future impact.\n"
            "Use [OBSERVATION] at the start of sentences identifying a trend that is accelerating "
            "or converging with existing vulnerabilities.\n"
            f"Emerging risks:\n{json.dumps(pruned, indent=2)}",
        )

    if block_key == "major-incidents":
        pruned = [
            {"id": i.get("id"), "description": i.get("desc"),
             "severity": i.get("severity"), "status": i.get("status")}
            for i in (mi.get("incidents") or [])[:5]
        ]
        return (
            f"You are a senior operational risk advisor at {org}{ind}. "
            "You diagnose control failures and tell leadership what they reveal about systemic weaknesses.",
            f"Write 2-3 sentences on what these incidents collectively expose about {org}'s "
            "control environment and operational resilience.\n"
            "Do not recount what happened. Assess what the pattern reveals and what leadership "
            "must address to prevent recurrence at scale.\n"
            "Use [OBSERVATION] at the start of sentences identifying a systemic pattern or "
            "control gap the incidents reveal.\n"
            "Use [RISK] at the start of sentences stating the operational or strategic exposure "
            f"this creates for {org}.\n"
            f"Incidents:\n{json.dumps(pruned, indent=2)}",
        )

    if block_key == "recommendations":
        base = [
            r.get("title") if isinstance(r, dict) else r
            for r in (rec.get("recommendations") or [])[:5]
        ]
        data = {
            "exposure":       {"score": ei.get("score"), "label": ei.get("label")},
            "high_risks":     rs.get("high_count"),
            "open_incidents": is_.get("open"),
            "base_recs":      base,
        }
        return (
            f"You are a risk advisor preparing specific, structured recommendations for {org}{ind}.",
            "Generate exactly 3 recommendations using this EXACT format — no deviations:\n\n"
            "Action 1: [Short title]\n"
            "Priority: [Critical / High / Medium / Low]\n"
            "Owner: [Relevant role or function]\n"
            "Due: [e.g. 7 Days / 14 Days / 30 Days]\n"
            "Expected Outcome: [One sentence describing the measurable result]\n"
            f"[Explanation — minimum 2 sentences. Be specific to {org}.]\n\n"
            "Action 2: [Short title]\n"
            "Priority: [...]\n"
            "Owner: [...]\n"
            "Due: [...]\n"
            "Expected Outcome: [...]\n"
            "[Explanation — minimum 2 sentences.]\n\n"
            "Action 3: [Short title]\n"
            "Priority: [...]\n"
            "Owner: [...]\n"
            "Due: [...]\n"
            "Expected Outcome: [...]\n"
            "[Explanation — minimum 2 sentences.]\n\n"
            "Rules:\n"
            "- Use only Action X: format.\n"
            "- Priority must be one of: Critical, High, Medium, Low.\n"
            "- Every action must have all 5 fields before the explanation.\n"
            f"Data:\n{json.dumps(data, indent=2)}",
        )

    if block_key == "executive-dashboard":
        data = {
            "exposure_label":  ei.get("label"),
            "high_risk_share": (
                round((rs.get("high_count", 0) / rs.get("total", 1)) * 100)
                if rs.get("total") else 0
            ),
            "new_escalations": krc.get("new_high_risks", 0),
            "control_changes": {
                "increased": krc.get("increased", 0),
                "decreased": krc.get("decreased", 0),
            },
        }
        return (
            f"You are a Chief Risk Officer briefing the leadership team of {org}{ind}. "
            "Your job is to communicate what the risk data means for the business, "
            "not to recite the data itself.",
            "Write exactly 3 to 4 short, standalone sentences for a leadership briefing panel "
            "titled 'What Leadership Needs To Know'.\n"
            "Each sentence must communicate a distinct business consequence, strategic implication, "
            "or decision prompt.\n"
            f"Do not state scores, counts, or percentages. Translate the data into what it means "
            f"for {org}'s ability to protect its objectives, serve its stakeholders, "
            "and manage its exposure.\n"
            "Each sentence goes on its own line. No labels, no numbering, no preamble.\n\n"
            f"Data context:\n{json.dumps(data, indent=2)}",
        )

    return None


async def generate_report_narrative(
    db: AsyncSession,
    tenant_id: UUID,
    block_data: dict,
    blocks: list[str],
    org_name: str,
    industry: str,
) -> dict[str, str | None]:
    """
    Generates AI narratives for all AI-capable blocks in the request.
    Returns a dict of {block_key: narrative_text}.
    Source: Reportservice.gs api_generateReportNarrative()
    """
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY is not configured")

    ai_cfg = await get_ai_config(db, tenant_id)
    if not ai_cfg['enabled']:
        raise ValueError('AI is disabled for this workspace.')

    model  = ai_cfg['model']
    policy = ai_cfg['policy']

    ai_blocks = [b for b in blocks if b in _AI_BLOCKS]
    if not ai_blocks:
        return {}

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    results: dict[str, str | None] = {}

    import asyncio

    async def _generate_one(key: str) -> tuple[str, str | None]:
        prompt = _build_prompt(key, block_data, org_name, industry)
        if prompt is None:
            return key, None
        system_p, user_p = prompt
        if policy:
            system_p = f'{system_p}\n\nWorkspace Policy:\n{policy}'
        text = await _call(client, system_p, user_p, model)
        return key, text

    tasks = [_generate_one(k) for k in ai_blocks]
    completed = await asyncio.gather(*tasks)
    for key, text in completed:
        results[key] = text

    return results