# app/services/brief_facts.py
"""
Facts the executive brief is generated from, and their fingerprint.

Shared by the AI service (to generate) and the dashboard service (to detect
when a stored brief no longer matches the figures). Imports schemas only,
so neither service creates a circular import.
"""

import hashlib
import json
from typing import Any

from app.schemas.dashboard import DashboardResponse


def brief_facts(d: DashboardResponse) -> dict[str, Any]:
    h, p, c, e, m = d.enterprise_health, d.pressure, d.correlation, d.control_evidence, d.movement
    breaching = next((a.refs for a in p.actions if a.key == "appetite_breach"), [])
    undecided = next((a.refs for a in p.actions if a.key == "undecided"), [])
    return {
        "health": {
            "score": h.score,
            "status": h.status,
            "capped_by_appetite": h.capped_by_appetite,
            "confidence": h.confidence,
            "confidence_reasons": h.confidence_reasons,
            "components": {x.name: x.score for x in h.components if not x.suppressed},
        },
        "appetite": {
            "configured": h.appetite.configured,
            "scale_max": h.scale_max,
            "avg_residual_of_risks_with_threshold": h.appetite.avg_residual_scored,
            "avg_threshold": h.appetite.threshold_avg,
            "risks_exceeding": p.exceeds_appetite,
            "breaching_risk_ids": breaching,
        },
        "pressure": {
            "score": p.score,
            "level": p.level,
            "active_risks": p.active_risks,
            "elevated": p.elevated,
            "undecided": p.undecided,
            "undecided_risk_ids": undecided,
            "past_target_date": p.past_target,
            "open_incidents": p.open_incidents,
            "open_incidents_overdue": p.open_incidents_overdue,
        },
        "correlation": {
            "incidents_total": c.incidents_total,
            "incidents_unlinked": c.incidents_unlinked,
            "uncovered_incident_categories": c.uncovered_categories,
            "risks_materialised": c.risks_materialised,
            "materialised_ratings_contradicted": c.contradicted,
        },
        "control_evidence": {
            "ratings_recorded": e.rated,
            "evidenced": e.evidenced,
            "tested_last_12_months": e.with_recent_test,
            "independently_asserted": e.independently_asserted,
        },
        "movement": {
            "snapshots_held": m.snapshots_held,
            "trend_findings": m.trend_findings,
            "overlap_findings": m.overlap_findings,
        },
    }


def facts_hash(facts: dict[str, Any]) -> str:
    """Stable fingerprint: key order and formatting never change the hash."""
    return hashlib.sha256(json.dumps(facts, sort_keys=True, default=str).encode()).hexdigest()