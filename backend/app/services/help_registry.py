# app/services/help_registry.py
"""
Ask Pulse help registry: the only source of in-app help text.

Ask Pulse (Ctrl K), the "?" explainers and the Help page all read from here.
Methodology wording is built from the engine's own constants and the
workspace's matrix and control effectiveness scale, so it cannot drift.

Entry kinds:
  concept  what a term or figure means
  how-to   numbered steps to get something done (steps required)
  page     what a screen is for
  setting  what a settings tab controls

Rules for new entries:
  - Describe only what the app does today. No planned features.
  - Never type a number the engine owns; import the constant.
  - Use British spelling and the labels exactly as they appear on screen.
  - Set `module` to "risk" or "incident" when the entry only makes sense
    with that module, so plans without it never see the entry.
"""

from app.core.config import settings
from app.schemas.help import HelpEntry
from app.schemas.matrix_config import MatrixConfigResponse, MATRIX_SCALE_MIN, MATRIX_SCALE_MAX
from app.services.ai_risk import AI_CONFIDENCE_LEVELS
from app.services.dashboard import (
    HEALTH_WEIGHTS, PRESSURE_WEIGHTS, _HEALTH_BANDS, _PRESSURE_BANDS,
    CONFIDENCE_MIN_SNAPSHOTS, CONFIDENCE_MIN_EVIDENCED_SHARE, CONFIDENCE_MIN_INCIDENTS,
)
from app.services.lookup import _DEFAULTS as LOOKUP_DEFAULTS
from app.services.phase_one import _FRESH_DAYS, _AGING_DAYS
from app.services.risk_status import (
    APPETITE_NEAR_RATIO, EVIDENCE_WINDOW_DAYS, INDEPENDENT_SOURCES, ai_escalate_index, ai_status_thresholds,
    band_labels, ce_label, elevated_phrase, high_control_text,
)
from app.services.settings import _DEFAULTS as SETTINGS_DEFAULTS

MANAGE_SETTINGS = "manage_settings"
MANAGE_RISKS = "manage_risks"
MANAGE_INCIDENTS = "manage_incidents"
MANAGE_USERS = "manage_users"
GENERATE_AI = "generate_ai"

RISK = "risk"
INCIDENT = "incident"

# Role keys as stored, and the names shown on screen.
_ROLE_LABELS = {"owner": "Admin", "mgr": "Manager", "analyst": "Analyst"}
_PERMISSION_LABELS = {
    "risks": "Manage Risks", "inc": "Manage Incidents", "ai": "Generate AI",
    "print": "Print Reports", "users": "Manage Users",
}


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


def _list_text(items: list[str] | tuple[str, ...], last: str = "and") -> str:
    items = [str(i) for i in items]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + f" {last} " + items[-1]


def _default_roles_text() -> str:
    """Which roles hold each permission by default, from the settings defaults."""
    parts: list[str] = []
    for key, label in _PERMISSION_LABELS.items():
        holders = [_ROLE_LABELS[r] for r in _ROLE_LABELS if SETTINGS_DEFAULTS.get(f"perm_{r}_{key}")]
        parts.append(f"{label}: {_list_text(holders) or 'nobody'}")
    return "; ".join(parts)


def build_help(m: MatrixConfigResponse) -> list[HelpEntry]:
    lik, imp = m.likelihood_scale, m.impact_scale
    top = lik * imp
    ce = m.ce_scale
    near = _pct(APPETITE_NEAR_RATIO)
    months = EVIDENCE_WINDOW_DAYS // 30
    sources = " or ".join(sorted(INDEPENDENT_SOURCES))
    bands = band_labels(m)  # type: ignore[arg-type]
    elevated = elevated_phrase(m)  # type: ignore[arg-type]
    esc_min, mon_min = ai_status_thresholds(m)  # type: ignore[arg-type]
    esc_idx = ai_escalate_index(len(bands))
    esc_levels = " or ".join(bands[esc_idx - 1:])
    if esc_idx >= 3:
        ai_status_how = (
            f"**Escalate** when the level is {esc_levels} or residual is {esc_min} or more; **Monitor** when the "
            f"level is {bands[esc_idx - 2]} or residual is {mon_min} or more; "
            + (f"**Review** when the level is {bands[esc_idx - 3]}; " if esc_idx >= 4 else "")
            + "**Stable** otherwise."
        )
    else:
        ai_status_how = (
            f"**Escalate** when the level is {esc_levels} or residual is {esc_min} or more; **Stable** otherwise."
        )
    treatments = _list_text(LOOKUP_DEFAULTS["treatment"])
    confidence_levels = _list_text([c.capitalize() for c in AI_CONFIDENCE_LEVELS], "or")
    default_role = _ROLE_LABELS.get(
        {"Owner": "owner", "Manager": "mgr", "Analyst": "analyst"}.get(str(SETTINGS_DEFAULTS["roles_default_role"]), ""),
        str(SETTINGS_DEFAULTS["roles_default_role"]),
    )
    recycle_days = settings.RECYCLE_BIN_TTL_DAYS

    return [
        # ── Getting started ──────────────────────────────────────────────────
        HelpEntry(
            id="get-started", group="Getting started", title="Get Started checklist", kind="page",
            what="The setup steps for a new workspace, from settings to your first report.",
            how=(
                "Open **Get Started** in the top bar. Work through the steps and click each one to mark it "
                "complete. Choose **Never show again** to hide the checklist."
            ),
            keywords=["get started", "setup", "onboarding", "checklist", "first steps", "new workspace", "begin"],
            related=["add-risk", "import-risks", "risk-appetite"],
        ),
        HelpEntry(
            id="add-risk", group="Getting started", title="Add a risk", kind="how-to", module=RISK,
            what="Log a new risk on the register and have Pulse score it.",
            steps=[
                "Open **Risk Register** and choose **Add Risk**.",
                "Describe the risk, then choose its category and owner.",
                f"Rate **Likelihood** and **Impact** on your {lik}×{imp} matrix. Pulse calculates "
                f"**severity** (Likelihood × Impact, from 1 to {top}).",
                "Rate **control effectiveness**. Pulse calculates the **residual risk**, the risk you still carry.",
                "Choose a **treatment** and save. The risk is placed in a band and appears on the dashboard straight away.",
            ],
            how=f"Bands on this workspace: {_list_text(bands)}. They come from Settings › Risk Matrix.",
            route="/risks/new", requires=MANAGE_RISKS,
            keywords=["add risk", "new risk", "create risk", "log risk", "first risk", "enter risk", "record risk"],
            related=["residual-risk", "control-effectiveness", "import-risks"],
        ),

        # ── Methodology ──────────────────────────────────────────────────────
        HelpEntry(
            id="severity", group="Methodology", title="Severity (inherent risk)",
            what="How bad a risk could be before any controls are taken into account.",
            how=(
                f"Severity = Likelihood × Impact on your {lik}×{imp} matrix, so it runs from 1 to {top}. "
                f"The score places the risk in a band: {_list_text(bands)}. Severity tells you how bad a risk "
                "could be; residual risk tells you how bad it still is after your controls."
            ),
            keywords=["severity", "inherent", "gross risk", "likelihood", "impact", "before controls",
                      "difference", "severity vs residual"],
            related=["residual-risk", "risk-matrix"],
        ),
        HelpEntry(
            id="residual-risk", group="Methodology", title="Residual risk",
            what="The risk score that remains after your controls are taken into account.",
            how=(
                f"Residual = Severity × (1 − control effectiveness level ÷ {ce}). Severity is "
                f"Likelihood × Impact on your {lik}×{imp} matrix, so scores run from 1 to {top}. "
                "A risk whose control effectiveness is Not assessed gets no reduction. If a residual is close "
                "to its severity, the controls are adding little."
            ),
            keywords=["residual", "net risk", "after controls", "formula", "calculation", "score",
                      "residual exposure", "difference", "severity vs residual"],
            related=["severity", "control-effectiveness"],
        ),
        HelpEntry(
            id="elevated", group="Methodology", title="Elevated risks",
            what="Risks in the top bands of your matrix, the ones that need management attention.",
            how=(
                f"On this workspace a risk is elevated when its band is {elevated}. Elevated risks feed the "
                "pressure score, and an elevated risk with no decision counts as undecided."
            ),
            keywords=["elevated", "high risk", "critical", "top risks", "serious", "major"],
            related=["undecided", "risk-pressure"],
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
            related=["residual-risk"],
        ),
        HelpEntry(
            id="risk-appetite", group="Settings", title="Risk appetite", kind="setting",
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
            related=["residual-risk", "enterprise-risk-health"],
        ),
        HelpEntry(
            id="risk-matrix", group="Settings", title="Risk matrix", kind="setting",
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
            related=["severity"],
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
            related=["confidence", "risk-pressure"],
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
            related=["link-incident-to-risk", "category-mapping"],
        ),
        HelpEntry(
            id="operational-feed", group="Dashboard", title="Operational feed",
            what="Recent changes to risks and incidents, newest first.",
            how="Switch between All, Risk and Incident with the toggle. Select an event to see its detail.",
            keywords=["feed", "events", "activity", "live", "changes", "log"],
        ),
        HelpEntry(
            id="executive-insights", group="Dashboard", title="Executive insights",
            what="An AI-written, plain-language read of your current risk position.",
            how=(
                "Open the dashboard and choose **View insights**. It is drafted from your live register, so the "
                "more current the register, the more useful the read. The scoring is the product; the AI only "
                "drafts the words. Check it against the figures before you share it."
            ),
            keywords=["insights", "executive", "summary", "ai summary", "narrative", "view insights", "posture"],
            related=["ai-settings"],
        ),
        HelpEntry(
            id="analytics", group="Dashboard", title="Analytics", kind="page",
            what="The detail behind the dashboard figures, in five tabs.",
            how=(
                "Open **Analytics** in the sidebar and choose a tab: **Overview**, **Correlation**, **Trends**, "
                "**Incidents** or **Activity**. "
                "The open tab is kept in the address, so a link can go straight to one section."
            ),
            route="/analytics",
            keywords=["analytics", "detail", "breakdown", "trends", "charts", "overview", "activity"],
            related=["enterprise-risk-health", "correlation"],
        ),

        # ── Risk register ────────────────────────────────────────────────────
        HelpEntry(
            id="edit-risk", group="Risk register", title="Edit or update a risk", kind="how-to", module=RISK,
            what="Change a risk's details or re-score it.",
            steps=[
                "Open the risk from the **Risk Register** and choose **Edit**.",
                "Change what you need. Re-scoring likelihood, impact or control effectiveness recalculates "
                "residual risk straight away.",
                "Save. Saving counts as a review, so the risk shows as Fresh again.",
            ],
            how=(
                "If the change moves the risk into another band, it is logged to the operational feed and "
                "picked up in the next Risk Brief. Every change is recorded in the Audit Log."
            ),
            route="/risks", requires=MANAGE_RISKS,
            keywords=["edit risk", "update risk", "change risk", "rescore", "re-score", "modify"],
            related=["freshness", "audit-log"],
        ),
        HelpEntry(
            id="freshness", group="Risk register", title="Fresh, Aging, Stale", module=RISK,
            what="How recently a risk was reviewed.",
            how=(
                f"Fresh when reviewed in the last {_FRESH_DAYS} days, Aging from {_FRESH_DAYS} to "
                f"{_AGING_DAYS - 1} days, and Stale at {_AGING_DAYS} days or more. These limits are fixed. "
                "The clock runs from the last review, or from the date logged if the risk was never reviewed. "
                "Saving an edit to the risk counts as a review. A stale risk is not necessarily a worse risk; "
                "nobody has looked at it recently. The Risk Brief has its own staleness threshold, set in "
                "Settings › Risk Brief, which decides when a stale risk is listed in the brief."
            ),
            keywords=["fresh", "aging", "stale", "review", "last updated", "currency", "flagged", "out of date"],
            related=["edit-risk", "daily-brief"],
        ),
        HelpEntry(
            id="undecided", group="Risk register", title="Undecided risks", module=RISK,
            what="Risks that matter and have no management decision recorded.",
            how=(
                "A risk is undecided when it is elevated or exceeds its appetite threshold, has no linked "
                "decision, and is not marked Accepted. Scoring a risk is not the same as deciding what "
                "to do about it."
            ),
            keywords=["undecided", "decision", "pending", "no decision", "treatment"],
            related=["record-decision", "elevated"],
        ),
        HelpEntry(
            id="record-decision", group="Risk register", title="Record a decision on a risk", kind="how-to",
            module=RISK,
            what="Show that management has decided what to do about a risk, so it stops counting as undecided.",
            steps=[
                "Open the risk from the **Risk Register** and choose **Edit**.",
                "Fill in **Linked decision** with where the decision was made, such as a committee minute "
                "or approval reference.",
                "Or, if the decision is to live with the risk, set the mitigation status to **Accepted**.",
                "Save.",
            ],
            route="/risks", requires=MANAGE_RISKS,
            keywords=["decision", "record decision", "linked decision", "accept risk", "approve", "sign off"],
            related=["undecided", "treatment"],
        ),
        HelpEntry(
            id="treatment", group="Risk register", title="Treatment and mitigation status", module=RISK,
            what="What you plan to do about a risk, and how far that plan has got.",
            how=(
                f"**Treatment** is chosen from your workspace list; the defaults are {treatments}. You can "
                "change the list in Settings › Taxonomy. **Mitigation status** is Open, In Progress, Closed or "
                "Accepted. Accepted counts as a management decision."
            ),
            keywords=["treatment", "mitigate", "avoid", "transfer", "accept", "mitigation", "status",
                      "plan", "action plan"],
            related=["record-decision", "taxonomy"],
        ),
        HelpEntry(
            id="import-risks", group="Risk register", title="Import risks", kind="how-to", module=RISK,
            what="Upload a spreadsheet of existing risks instead of entering them one by one.",
            steps=[
                "Export your current register as a CSV or Excel file.",
                "In **Risk Register**, choose **Import Risks** and upload the file.",
                "Check how your columns are matched to Pulse fields, and correct any the importer guessed wrong.",
                "Confirm. Pulse scores each imported risk.",
            ],
            how=(
                "The mapping is remembered on this browser and reused when the next file has the same columns. "
                "Rows matching an existing risk on description, category and owner are skipped as duplicates, "
                "and the workspace risk limit applies. An incomplete register still imports, and Pulse shows "
                "what is missing."
            ),
            where="Risk register › Import Risks",
            route="/risks", requires=MANAGE_RISKS,
            keywords=["import", "upload", "spreadsheet", "csv", "excel", "xlsx", "migrate", "bulk",
                      "existing register"],
            related=["add-risk"],
        ),
        HelpEntry(
            id="export-register", group="Risk register", title="Export or print the register", kind="how-to",
            module=RISK,
            what="Download the register as a spreadsheet or print it.",
            steps=[
                "Open **Risk Register** and choose **Print Report** (the printer icon).",
                "Choose the scope: all risks, or only those matching your current filters.",
                "Choose **Export CSV** for a spreadsheet, or print.",
            ],
            route="/risks",
            keywords=["export", "download", "csv", "print register", "spreadsheet", "extract"],
            related=["report-builder"],
        ),
        HelpEntry(
            id="ai-insights", group="Risk register", title="AI Insights on risks", kind="how-to", module=RISK,
            what="A short, AI-suggested corrective action for each risk.",
            steps=[
                "Open **Risk Register** and choose **AI Insights**.",
                "Choose which risks: new risks without an insight, the risks matching your filters, or the "
                "risks you have selected.",
                "Add notes for the AI if you want, and tick **Overwrite existing insights** to replace old ones.",
                "Generate. Read each insight before acting on it.",
            ],
            how=(
                "Each insight ends with a Confidence and a Status. See **AI Confidence and Status** for what "
                "they mean. AI must be switched on in Settings › AI & Automation."
            ),
            route="/risks", requires=GENERATE_AI,
            keywords=["ai", "ai insights", "generate", "suggestion", "corrective action", "artificial intelligence",
                      "claude"],
            related=["ai-confidence-status", "ai-settings"],
        ),
        HelpEntry(
            id="ai-confidence-status", group="Risk register", title="AI Confidence and Status", module=RISK,
            what="Two labels at the end of each AI insight. They do different jobs and are independent.",
            how=(
                f"**Confidence** is how boldly the AI was told to write: {confidence_levels}. It comes from "
                "Settings › AI & Automation. **Status** is worked out from the risk itself and the bands of "
                f"your matrix: {ai_status_how}"
            ),
            keywords=["confidence", "status", "escalate", "monitor", "review", "stable", "conservative",
                      "balanced", "assertive"],
            related=["ai-insights"],
        ),
        HelpEntry(
            id="submission-link", group="Risk register", title="Risk submission link", module=RISK,
            what="A shareable link that lets anyone in the business report a risk without an account.",
            how=(
                "Submissions arrive in the triage queue, where your team reviews each one and accepts, "
                "merges, reroutes or closes it."
            ),
            where="Risk register › Submission Links",
            route="/risks/submission-links", requires=MANAGE_RISKS,
            keywords=["submission", "public link", "external", "report a risk", "form", "triage"],
            related=["triage-queue"],
        ),
        HelpEntry(
            id="triage-queue", group="Risk register", title="Submissions inbox", kind="page", module=RISK,
            what="Where risks reported through a submission link wait for your team to review them.",
            how=(
                "Open each submission, then either score it and promote it to the register, merge it into an "
                "existing risk, or close it with a note to the submitter. Unfinished triage is saved on this "
                "browser as a draft."
            ),
            route="/risks/triage", requires=MANAGE_RISKS,
            keywords=["triage", "inbox", "submissions", "pending", "promote", "merge", "review submission"],
            related=["submission-link"],
        ),
        HelpEntry(
            id="recycle-bin", group="Risk register", title="Recycle bin", module=RISK,
            what="Where deleted risks go, so a mistake can be undone.",
            how=(
                f"A deleted risk stays in the recycle bin for {recycle_days} days, then it is deleted for good. "
                "Use the **Recycle Bin** link below the risk table to restore one."
            ),
            route="/risks",
            keywords=["recycle", "bin", "deleted", "restore", "undo", "trash", "recover", "delete risk"],
        ),

        # ── Incidents ────────────────────────────────────────────────────────
        HelpEntry(
            id="incident-workflow", group="Incidents", title="Handle an incident", kind="how-to", module=INCIDENT,
            what="Log an incident and take it through to closure.",
            steps=[
                "Open **Incidents** and choose **Add Incident**.",
                "Record when it happened, who reported it, its category and severity, and what happened.",
                "Link it to the risk on your register that it relates to.",
                "Set an owner and work it through the statuses to Resolved, then Closed.",
            ],
            how=(
                "Linking matters: a linked incident shows that a risk you already knew about is materialising, "
                "and whether its controls held. Open incidents appear in the operational feed with their target "
                "clock running, and in the Risk Brief."
            ),
            route="/incidents/new", requires=MANAGE_INCIDENTS,
            keywords=["incident", "log incident", "add incident", "report incident", "workflow", "new incident"],
            related=["link-incident-to-risk", "incident-statuses", "incident-sla"],
        ),
        HelpEntry(
            id="incident-statuses", group="Incidents", title="Incident status and review status",
            module=INCIDENT,
            what="Where an incident is in its life, and how far its review has got.",
            how=(
                "**Status** is New, Open, In Progress, Under Review, Resolved or Closed. The first four count as "
                "open, and only open incidents run against their target. **Review status** records the "
                "investigation: Triaged, Investigating, Pending Evidence, Remediating or Validated."
            ),
            keywords=["status", "review status", "lifecycle", "open", "resolved", "closed", "triaged",
                      "investigating", "validated"],
            related=["incident-workflow", "incident-sla"],
        ),
        HelpEntry(
            id="link-incident-to-risk", group="Incidents", title="Linking an incident to a risk", module=INCIDENT,
            what="Connecting an incident to the register risk it relates to.",
            how=(
                "Do it during triage. Linking is what lets the correlation panel work: an incident with "
                "no link cannot show whether the register anticipated it."
            ),
            keywords=["link", "linked risk", "connect", "relate", "match incident"],
            related=["correlation", "category-mapping"],
        ),
        HelpEntry(
            id="incident-sla", group="Incidents", title="Incident SLA", kind="setting", module=INCIDENT,
            what="The time target you set for each incident severity level.",
            how=(
                "An open incident breaches as soon as its age passes the target for its severity. "
                "A resolved incident is judged on how long it took to resolve."
            ),
            where="Settings › Incident Severity & SLA",
            route="/settings?tab=inc-sev", requires=MANAGE_SETTINGS,
            keywords=["sla", "target", "breach", "overdue", "resolution time", "escalation"],
        ),
        HelpEntry(
            id="incident-submission-link", group="Incidents", title="Incident reporting link", module=INCIDENT,
            what="A link that lets anyone report an incident without an account.",
            how=(
                "Open **Incidents** and choose the external submission link icon to copy your workspace's link. "
                "Reports arrive in the incident log as New."
            ),
            route="/incidents",
            keywords=["external", "report incident", "public link", "share link", "whistle", "staff report"],
        ),
        HelpEntry(
            id="category-mapping", group="Incidents", title="Incident to risk category mapping", kind="setting",
            module=INCIDENT,
            what="Which risk categories cover each incident category.",
            how=(
                "The dashboard uses this to tell a real register gap from a naming difference. A row left on "
                "automatic matches a risk category with the same name."
            ),
            where="Settings › Taxonomy",
            route="/settings?tab=tax", requires=MANAGE_SETTINGS,
            keywords=["mapping", "category map", "incident category", "cover", "gap", "blind spot"],
            related=["correlation"],
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
            related=["export-report"],
        ),
        HelpEntry(
            id="export-report", group="Reports", title="Export a board report", kind="how-to",
            what="Produce a PDF or PowerPoint report for management or the board.",
            steps=[
                "Open **Report Builder**.",
                "Choose the sections you want and the date range.",
                "Preview, then export as PDF or PowerPoint.",
            ],
            how="The report is built from the live register, so it shows where you stand right now.",
            route="/reports",
            keywords=["print report", "export report", "board pack", "management report", "download report"],
            related=["report-builder"],
        ),
        HelpEntry(
            id="daily-brief", group="Reports", title="Daily risk brief", kind="how-to",
            what="A morning email summarising your risk position.",
            steps=[
                "Go to **Settings › Risk Brief** and set **Brief Status** to On.",
                "Choose a **Send Time** in the workspace time zone.",
                "Add **Recipients**, separated by commas. The first address is used for personalisation.",
                "Send yourself a test brief.",
            ],
            how=(
                "The daily exception feed always runs. You can add a Weekly Digest (Mondays), a Monthly Posture "
                "(first business day) and a Quarterly Board Summary. Thresholds in the same tab decide when "
                "stale risks and control testing appear in the brief."
            ),
            where="Settings › Risk Brief",
            route="/settings?tab=brief", requires=MANAGE_SETTINGS,
            keywords=["brief", "daily", "email", "digest", "morning", "notification", "weekly", "monthly",
                      "quarterly"],
            related=["freshness"],
        ),

        # ── Users and access ─────────────────────────────────────────────────
        HelpEntry(
            id="invite-users", group="Users & access", title="Invite your team", kind="how-to",
            what="Give colleagues access to the workspace.",
            steps=[
                "Open **Users** and choose **Invite User**.",
                "Enter their email address and choose a role.",
                "They get an email with a link to join.",
            ],
            how=(
                "Invite your risk owners, not just the risk team: a register only stays live if owners keep it "
                "updated. Users also fill the Dept/Risk Owner list on the register. Your plan sets the user limit."
            ),
            route="/users", requires=MANAGE_USERS,
            keywords=["invite", "add user", "team", "colleague", "users", "access", "onboard staff"],
            related=["roles-permissions"],
        ),
        HelpEntry(
            id="roles-permissions", group="Users & access", title="Roles and permissions", kind="setting",
            what="What Admins, Managers and Analysts can do in this workspace.",
            how=(
                "Each permission can be switched on or off per role in Settings › Users & Roles. The defaults "
                f"are: {_default_roles_text()}. Review & Resolve follows Manage Incidents. Manage Settings is "
                f"always Admin only. New users get the **{default_role}** role unless you choose another."
            ),
            where="Settings › Users & Roles",
            route="/settings?tab=roles", requires=MANAGE_SETTINGS,
            keywords=["role", "roles", "permission", "permissions", "admin", "manager", "analyst", "rights",
                      "who can"],
            related=["invite-users"],
        ),
        HelpEntry(
            id="audit-log", group="Users & access", title="Audit log", kind="page",
            what="A record of who changed what in the workspace, and when.",
            how=(
                "Each entry shows the time, the user, the module, the action, the record and a summary. "
                "Search by user to see one person's changes."
            ),
            route="/audit", requires=MANAGE_SETTINGS,
            keywords=["audit", "log", "history", "who changed", "changed", "trail", "changes", "accountability",
                      "risk history", "record history"],
        ),
        HelpEntry(
            id="workspaces", group="Users & access", title="Switch or create a workspace", kind="how-to",
            what="Move between workspaces, or set up a new one.",
            steps=[
                "Open the **Workspace** menu in the top bar.",
                "Choose **Switch workspace**, or create a new one.",
            ],
            how=(
                "Each workspace has its own register, incidents, members and settings. Switching and creating "
                "are not available during a trial, and your plan sets how many workspaces you can own."
            ),
            keywords=["workspace", "switch", "change workspace", "new workspace", "create workspace",
                      "organisation", "subsidiary"],
        ),
        HelpEntry(
            id="workspace-pin", group="Users & access", title="Workspace PIN", kind="setting",
            what="A 6-digit PIN every user must enter before opening this workspace.",
            how="Set or change it in Settings › Workspace. It adds a second check on top of signing in.",
            where="Settings › Workspace",
            route="/settings?tab=ws", requires=MANAGE_SETTINGS,
            keywords=["pin", "security", "lock", "code", "verify", "6 digit"],
        ),

        # ── Settings ─────────────────────────────────────────────────────────
        HelpEntry(
            id="workspace-settings", group="Settings", title="Workspace settings", kind="setting",
            what="Your workspace's name, organisation, time zone, date format, currency, logo and colours.",
            how=(
                "The time zone sets when the Risk Brief is sent. The currency is used for financial figures. "
                "The logo and colours appear across the app."
            ),
            where="Settings › Workspace",
            route="/settings?tab=ws", requires=MANAGE_SETTINGS,
            keywords=["workspace", "name", "logo", "brand", "colour", "color", "time zone", "timezone",
                      "currency", "date format", "theme"],
        ),
        HelpEntry(
            id="taxonomy", group="Settings", title="Taxonomy (dropdown lists)", kind="setting",
            what="The dropdown values used across the register, incidents and forms.",
            how=(
                "Edit the lists for Category, Treatment, Dept/Risk Owner and Business Unit. With the Incident "
                "module you also edit Incident Category and Incident Severity, and map incident categories to "
                "risk categories."
            ),
            where="Settings › Taxonomy",
            route="/settings?tab=tax", requires=MANAGE_SETTINGS,
            keywords=["taxonomy", "categories", "category", "dropdown", "list", "departments", "owners",
                      "business unit", "configuration"],
            related=["category-mapping", "treatment"],
        ),
        HelpEntry(
            id="ai-settings", group="Settings", title="AI & Automation", kind="setting",
            what="Whether AI is used in this workspace, and how it writes.",
            how=(
                "Switch AI on or off; choose **Full Analysis** (deeper) or **Quick Scan** (faster); set "
                f"Confidence to {confidence_levels}; choose whether AI runs on every new risk. The prompt "
                "policy sets tone and what the AI must leave out, such as names or financial figures, for every "
                "AI call in the workspace."
            ),
            where="Settings › AI & Automation",
            route="/settings?tab=ai", requires=MANAGE_SETTINGS,
            keywords=["ai settings", "model", "prompt", "policy", "tone", "redact", "switch off ai",
                      "automation"],
            related=["ai-insights", "ai-confidence-status"],
        ),
        HelpEntry(
            id="billing", group="Settings", title="Plan, licence and trial", kind="setting",
            what="Your plan, when it expires, your risk and user limits, and which modules you have.",
            how=(
                "See it in Settings › Billing. To change your plan, or for an invoice for procurement, "
                "contact support."
            ),
            where="Settings › Billing",
            route="/settings?tab=bill", requires=MANAGE_SETTINGS,
            keywords=["billing", "plan", "licence", "license", "trial", "subscription", "expiry", "invoice",
                      "limit", "upgrade", "renew"],
        ),
        HelpEntry(
            id="frameworks", group="Methodology", title="Frameworks page", kind="page",
            what="Your scoring methodology on one page: score ranges, bands and what each band expects.",
            how="It reads from your matrix and appetite settings, so it always matches how Pulse scores your risks.",
            route="/frameworks",
            keywords=["framework", "methodology", "iso 31000", "bands", "classification", "expectation"],
            related=["risk-matrix", "severity"],
        ),
    ]
