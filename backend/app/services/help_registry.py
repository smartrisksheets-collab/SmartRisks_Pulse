# app/services/help_registry.py
"""
Ask Pulse help registry: the only source of in-app help text.
Methodology wording is built from the engine's own constants and the
workspace's matrix and control effectiveness scale, so it cannot drift.
"""

from app.schemas.help import HelpEntry
from app.schemas.matrix_config import MatrixConfigResponse, MATRIX_SCALE_MIN, MATRIX_SCALE_MAX
from app.services.dashboard import (
    HEALTH_WEIGHTS, PRESSURE_WEIGHTS, _HEALTH_BANDS, _PRESSURE_BANDS,
    CONFIDENCE_MIN_SNAPSHOTS, CONFIDENCE_MIN_EVIDENCED_SHARE, CONFIDENCE_MIN_INCIDENTS,
)
from app.services.phase_one import _FRESH_DAYS, _AGING_DAYS
from app.services.risk_status import (
    APPETITE_NEAR_RATIO, EVIDENCE_WINDOW_DAYS, INDEPENDENT_SOURCES, ce_label, high_control_text,
)

MANAGE_SETTINGS = "manage_settings"
MANAGE_RISKS = "manage_risks"


def _pct(x: float) -> int:
    return round(x * 100)


def _weights_text(weights: dict[str, int]) -> str:
    return ", ".join(f"{name.lower()} ({w})" for name, w in weights.items())


def _bands_text(bands: tuple[tuple[int, str], ...], floor: str) -> str:
    parts = [f"{label} at {low} or above" for low, label in bands]
    return ", ".join(parts) + f", and {floor} below {bands[-1][0]}"


def _ce_steps(scale: int, labels: dict[str, str]) -> str:
    steps: list[str] = []
    for lvl in range(scale + 1):
        name = ce_label(lvl, labels)
        tag = str(lvl) if name == str(lvl) else f"{lvl} ({name})"
        steps.append(f"{tag} removes {round(lvl / scale * 100)}%")
    return ", ".join(steps)


def build_help(m: MatrixConfigResponse) -> list[HelpEntry]:
    lik, imp = m.likelihood_scale, m.impact_scale
    top = lik * imp
    ce = m.ce_scale
    near = _pct(APPETITE_NEAR_RATIO)
    months = EVIDENCE_WINDOW_DAYS // 30
    sources = " or ".join(sorted(INDEPENDENT_SOURCES))

    return [
        # ── Methodology ──────────────────────────────────────────────────────
        HelpEntry(
            id="residual-risk", group="Methodology", title="Residual risk",
            what="The risk score that remains after your controls are taken into account.",
            how=(
                f"Residual = Severity × (1 − control effectiveness level ÷ {ce}). Severity is "
                f"Likelihood × Impact on your {lik}×{imp} matrix, so scores run from 1 to {top}. "
                "A risk whose control effectiveness is Not assessed gets no reduction."
            ),
            keywords=["residual", "net risk", "after controls", "formula", "calculation", "score"],
        ),
        HelpEntry(
            id="control-effectiveness", group="Methodology", title="Control effectiveness",
            what="How much of a risk's severity your existing controls remove.",
            how=(
                f"Rated 0 to {ce} on this workspace's scale, or Not assessed. Each level removes a fixed "
                f"share of severity: {_ce_steps(ce, dict(m.ce_labels))}. A rating of {ce} removes all of it, "
                "so it is the largest assumption on any risk record. A rating counts as **evidenced** only "
                f"when it was tested within the last {months} months and asserted as {sources}."
            ),
            where="Scale and level names: Settings › Control Effectiveness",
            route="/settings?tab=ce", requires=MANAGE_SETTINGS,
            keywords=["control", "effectiveness", "control strength", "rating", "evidence", "evidenced"],
        ),
        HelpEntry(
            id="risk-appetite", group="Settings", title="Risk appetite",
            what="The level of residual risk your organisation has agreed to accept, set per risk category.",
            how=(
                "Each risk is compared with the threshold for its category: **Exceeds** when residual is "
                f"above the threshold, **Near** when it is above {near}% of it, and **Within** otherwise. "
                "A category with no threshold shows No threshold. In the board report, Top Risks lists "
                "appetite breaches first."
            ),
            where="Settings › Risk Appetite",
            route="/settings?tab=appetite", requires=MANAGE_SETTINGS,
            keywords=["appetite", "tolerance", "threshold", "limit", "breach", "exceeds", "within", "near"],
        ),
        HelpEntry(
            id="risk-matrix", group="Settings", title="Risk matrix",
            what="The likelihood and impact scale your risk scores are calculated on.",
            how=(
                f"Likelihood and impact each run on a scale of {MATRIX_SCALE_MIN} to {MATRIX_SCALE_MAX}, "
                "and you choose 2 to 5 bands with their names and score ranges. This workspace uses "
                f"{lik}×{imp}, so scores run from 1 to {top}. Saving re-classifies every existing risk "
                "immediately. The matrix cannot be made smaller while existing scores or appetite "
                "thresholds would fall outside it."
            ),
            where="Settings › Risk Matrix",
            route="/settings?tab=matrix", requires=MANAGE_SETTINGS,
            keywords=["matrix", "scale", "likelihood", "impact", "bands", "scoring", "heat map", "5x5"],
        ),

        # ── Dashboard ────────────────────────────────────────────────────────
        HelpEntry(
            id="enterprise-risk-health", group="Dashboard", title="Enterprise risk health",
            what="A single score from 0 to 100 summarising your risk position. Higher is better.",
            how=(
                f"A weighted score from five parts: {_weights_text(HEALTH_WEIGHTS)}. A part with no data "
                f"is left out and its weight is shared among the others. Status is "
                f"{_bands_text(_HEALTH_BANDS, 'Critical')}. Any appetite breach lowers a Healthy or "
                "Monitoring status to At Risk, whatever the score."
            ),
            keywords=["health", "score", "enterprise", "composite", "overall", "why"],
        ),
        HelpEntry(
            id="appetite-bar", group="Dashboard", title="The appetite bar",
            what=(
                "Your average residual risk set against your average appetite threshold, "
                f"on this workspace's 0 to {top} scale."
            ),
            how=(
                "Both averages use only risks whose category has a threshold, so the comparison "
                "is like for like."
            ),
            keywords=["bar", "appetite", "marker", "headroom", "gauge", "threshold line"],
        ),
        HelpEntry(
            id="confidence", group="Dashboard", title="Confidence",
            what="How much weight to put on the health score above it.",
            how=(
                "High when none of these apply, Medium when one does, Low when two or more do: "
                f"fewer than {CONFIDENCE_MIN_SNAPSHOTS} monthly snapshots held; no appetite thresholds "
                f"set; no control ratings recorded, or fewer than {_pct(CONFIDENCE_MIN_EVIDENCED_SHARE)}% "
                f"of them evidenced; fewer than {CONFIDENCE_MIN_INCIDENTS} incidents recorded."
            ),
            keywords=["confidence", "low confidence", "reliability", "certainty"],
        ),
        HelpEntry(
            id="risk-pressure", group="Dashboard", title="Risk pressure",
            what="Where pressure is building now: elevated risks, breaches, overdue incidents and pending decisions.",
            how=(
                f"A weighted score from four parts: {_weights_text(PRESSURE_WEIGHTS)}. Open incident load "
                "is the share of open incidents past their severity target. Decision backlog counts risks "
                "that are undecided or past their target date. Level is "
                f"{_bands_text(_PRESSURE_BANDS, 'Low')}. Health asks how you are doing overall; pressure "
                "asks what needs attention now."
            ),
            keywords=["pressure", "elevated", "building", "attention", "backlog"],
        ),
        HelpEntry(
            id="correlation", group="Dashboard", title="Risk and incident correlation",
            what="What your risk register and your incident log say about each other.",
            how=(
                "Three findings: risks that materialised (an incident is linked to them), incidents with no "
                "linked risk, and control ratings an incident has contradicted (rated "
                f"{high_control_text(ce)} on this workspace's scale, yet an incident followed). An incident "
                "category counts as covered only when it is mapped in Settings to a risk category that holds "
                "at least one risk. A link records an association made at triage, not a finding of cause."
            ),
            keywords=["correlation", "materialised", "unlinked", "blind spot", "contradicted", "linked"],
        ),
        HelpEntry(
            id="operational-feed", group="Dashboard", title="Operational feed",
            what="Recent changes to risks and incidents, newest first.",
            how="Switch between All, Risk and Incident with the toggle. Select an event to see its detail.",
            keywords=["feed", "events", "activity", "live", "changes", "log"],
        ),

        # ── Risk register ────────────────────────────────────────────────────
        HelpEntry(
            id="freshness", group="Risk register", title="Fresh, Aging, Stale",
            what="How recently a risk was reviewed.",
            how=(
                f"Fresh when reviewed in the last {_FRESH_DAYS} days, Aging from {_FRESH_DAYS} to "
                f"{_AGING_DAYS - 1} days, and Stale at {_AGING_DAYS} days or more. The clock runs from the "
                "last review, or from the date logged if the risk was never reviewed. Saving an edit to the "
                "risk counts as a review. A stale risk is not necessarily a worse risk; nobody has looked "
                "at it recently."
            ),
            keywords=["fresh", "aging", "stale", "review", "last updated", "currency"],
        ),
        HelpEntry(
            id="undecided", group="Risk register", title="Undecided risks",
            what="Risks that matter and have no management decision recorded.",
            how=(
                "A risk is undecided when it is elevated or exceeds its appetite threshold, has no linked "
                "decision, and is not marked Accepted. Scoring a risk is not the same as deciding what "
                "to do about it."
            ),
            keywords=["undecided", "decision", "pending", "no decision", "treatment"],
        ),
        HelpEntry(
            id="import-risks", group="Risk register", title="Import risks",
            what="Upload a spreadsheet of existing risks instead of entering them one by one.",
            how=(
                "Map your columns once. The mapping is remembered on this browser and reused when the next "
                "file has the same columns. Rows matching an existing risk on description, category and "
                "owner are skipped as duplicates, and the workspace risk limit applies."
            ),
            where="Risk register › Import Risks",
            route="/risks", requires=MANAGE_RISKS,
            keywords=["import", "upload", "spreadsheet", "csv", "excel", "migrate", "bulk"],
        ),
        HelpEntry(
            id="submission-link", group="Risk register", title="Risk submission link",
            what="A shareable link that lets anyone in the business report a risk without an account.",
            how=(
                "Submissions arrive in the triage queue, where your team reviews each one and accepts, "
                "merges, reroutes or closes it."
            ),
            where="Risk register › Submission Links",
            route="/risks/submission-links", requires=MANAGE_RISKS,
            keywords=["submission", "public link", "external", "report a risk", "form", "triage"],
        ),

        # ── Incidents ────────────────────────────────────────────────────────
        HelpEntry(
            id="link-incident-to-risk", group="Incidents", title="Linking an incident to a risk",
            what="Connecting an incident to the register risk it relates to.",
            how=(
                "Do it during triage. Linking is what lets the correlation panel work: an incident with "
                "no link cannot show whether the register anticipated it."
            ),
            keywords=["link", "linked risk", "connect", "relate", "match incident"],
        ),
        HelpEntry(
            id="incident-sla", group="Incidents", title="Incident SLA",
            what="The time target you set for each incident severity level.",
            how=(
                "An open incident breaches as soon as its age passes the target for its severity. "
                "A resolved incident is judged on how long it took to resolve."
            ),
            where="Settings › Incident Severity & SLA",
            route="/settings?tab=inc-sev", requires=MANAGE_SETTINGS,
            keywords=["sla", "target", "breach", "overdue", "resolution time", "escalation"],
        ),

        # ── Reports ──────────────────────────────────────────────────────────
        HelpEntry(
            id="report-builder", group="Reports", title="Report builder",
            what="Builds a board report from your live register, exported as PDF or PowerPoint.",
            how=(
                "Choose the sections and the date range. In the PDF, a section your data cannot support "
                "prints as **Not generated**, with the reason and what would enable it. Trend sections need "
                "at least two monthly snapshots."
            ),
            route="/reports",
            keywords=["report", "pdf", "pptx", "powerpoint", "board", "export", "builder", "committee"],
        ),
        HelpEntry(
            id="daily-brief", group="Reports", title="Daily risk brief",
            what="A morning email summarising your risk position.",
            how=(
                "Sent on weekdays at the time you set, in the workspace time zone, to the recipients you "
                "choose. Send yourself a test first."
            ),
            where="Settings › Risk Brief",
            route="/settings?tab=brief", requires=MANAGE_SETTINGS,
            keywords=["brief", "daily", "email", "digest", "morning", "notification"],
        ),
    ]