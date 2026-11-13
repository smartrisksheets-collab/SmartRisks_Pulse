# app/services/incident_status.py
"""One definition of the incident stage line and the labels derived from it.

Every surface (incident log, panel, Home, Analytics, scheduler) reads stages,
open/terminal sets, next stage, stage note and the target-to-resolve wording
from here, so the screens only pick a colour.
"""

import math
from datetime import date, datetime, timedelta, timezone

STAGES: tuple[str, ...] = ('New', 'Triaged', 'Investigating', 'Remediating', 'Resolved', 'Closed')
TERMINAL_STATUSES: frozenset[str] = frozenset({'Resolved', 'Closed'})

# Values stored before migration 064. Accepted on write and normalised, and still
# counted as open on read, so the order of SQL and deploy does not matter.
LEGACY_STATUS_MAP: dict[str, str] = {
    'Open': 'Triaged',
    'In Progress': 'Investigating',
    'Under Review': 'Remediating',
}
OPEN_STATUSES: frozenset[str] = frozenset(
    {s for s in STAGES if s not in TERMINAL_STATUSES} | set(LEGACY_STATUS_MAP)
)

# The panel's stepper shows the working line; Closed is the end state after it.
STEPPER: tuple[str, ...] = STAGES[:5]

_NEXT_LABEL: dict[str, str] = {
    'New': 'Move to Triaged',
    'Triaged': 'Move to Investigating',
    'Investigating': 'Move to Remediating',
    'Remediating': 'Mark as resolved',
    'Resolved': 'Close incident',
}

_STAGE_NOTE: dict[str, str] = {
    'New': 'Waiting for triage. Confirm severity and owner, then link it to a risk.',
    'Triaged': 'Triaged. Start the investigation to establish the cause.',
    'Investigating': 'The cause is being established.',
    'Remediating': 'Fix in progress. Resolve once the control is shown to work.',
    'Resolved': 'Resolved. Close it once the lessons are recorded on the linked risk.',
    'Closed': 'Closed. No further action is expected.',
}

# Merged control outcome list (pack decision, 13 Nov 2026): the stored values
# stay, Held and Not known are added.
CONTROL_OUTCOMES: tuple[str, ...] = (
    'control_held',
    'control_partially_worked',
    'control_failed',
    'control_was_bypassed',
    'control_not_applicable',
    'no_control_existed',
    'not_known',
)
IMPACT_CONFIDENCE: tuple[str, ...] = ('Unknown', 'Estimated', 'Confirmed')

# Target hours used when a workspace has no SLA rows yet (same as get_stats).
DEFAULT_TARGET_HOURS: dict[str, float] = {'Very High': 24.0, 'High': 72.0, 'Medium': 120.0, 'Low': 240.0}
FALLBACK_TARGET_HOURS = 120.0


def normalise_status(status: str | None) -> str:
    """Current stage name for a stored or submitted status. Blank means New."""
    s = (status or '').strip()
    if not s:
        return 'New'
    return LEGACY_STATUS_MAP.get(s, s)


def is_valid_status(status: str) -> bool:
    return normalise_status(status) in STAGES


def is_open(status: str | None) -> bool:
    return normalise_status(status) not in TERMINAL_STATUSES


def next_status(status: str | None) -> str | None:
    s = normalise_status(status)
    if s not in STAGES or s == 'Closed':
        return None
    return STAGES[STAGES.index(s) + 1]


def next_label(status: str | None) -> str | None:
    return _NEXT_LABEL.get(normalise_status(status))


def stage_note(status: str | None) -> str:
    return _STAGE_NOTE.get(normalise_status(status), '')


def stepper(status: str | None) -> list[tuple[str, str]]:
    """[(stage, 'done' | 'current' | 'todo')] for the panel. Closed marks every step done."""
    s = normalise_status(status)
    if s == 'Closed':
        return [(name, 'done') for name in STEPPER]
    idx = STEPPER.index(s) if s in STEPPER else 0
    return [(name, 'done' if k < idx else 'current' if k == idx else 'todo') for k, name in enumerate(STEPPER)]


def effective_sla(sla_map: dict[str, float]) -> dict[str, float]:
    """Workspace SLA hours, or the platform defaults when none are configured."""
    return sla_map if sla_map else DEFAULT_TARGET_HOURS


def target_hours_for(severity: str | None, sla_hours: dict[str, float]) -> float:
    return sla_hours.get(str(severity or ''), FALLBACK_TARGET_HOURS)


def _plural_days(n: int) -> str:
    return f"{n} day" if n == 1 else f"{n} days"


def target_days(hours: float) -> int:
    """Whole days shown beside a severity (same rounding as get_stats)."""
    return max(1, round(hours / 24))


def resolve_by(reported_at: date, hours: float) -> date:
    """Last day inside the target. The clock starts at the start of the reported day (as compute_breach)."""
    start = datetime(reported_at.year, reported_at.month, reported_at.day, tzinfo=timezone.utc)
    return (start + timedelta(hours=hours) - timedelta(seconds=1)).date()


def target_state(
    *,
    status: str | None,
    reported_at: date | None,
    resolved_at: datetime | None,
    hours: float,
    breached: bool,
    today: date,
) -> tuple[str, str, date | None]:
    """(state, wording, resolve-by date). state is due, due_today, missed, met or none.

    `breached` comes from compute_breach for open incidents, so this wording
    always agrees with the SLA breach KPI.
    """
    if reported_at is None:
        return 'none', 'No reported date', None
    due = resolve_by(reported_at, hours)
    if is_open(status):
        if breached:
            late = max(1, (today - due).days)
            return 'missed', f"Missed by {_plural_days(late)}", due
        left = (due - today).days
        if left <= 0:
            return 'due_today', 'Due today', due
        return 'due', f"Due in {_plural_days(left)}", due
    if resolved_at is None:
        return 'none', 'Resolved, no date', due
    rd = resolved_at.date() if isinstance(resolved_at, datetime) else resolved_at
    taken = (rd - reported_at).days
    if taken * 24 > hours:
        return 'missed', f"Missed by {_plural_days(max(1, taken - math.floor(hours / 24)))}", due
    return 'met', 'Met', due
