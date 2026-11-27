"""
Account names: the one place that writes them.

accounts.name stays the full name (read by the dashboard, admin panel and
Users). first_name and last_name are always written with it, so the three
never disagree.
"""

from app.models.account import Account


def clean_name(value: str | None) -> str:
    """Trim and collapse runs of whitespace."""
    return " ".join(str(value or "").split())


def split_full_name(full: str | None) -> tuple[str, str]:
    """Split a full name at the first space: ("Chinedu", "Ozulumba Okafor")."""
    parts = clean_name(full).split(" ", 1)
    first = parts[0]
    last = parts[1] if len(parts) > 1 else ""
    return first, last


def set_account_name(account: Account, first: str | None, last: str | None) -> None:
    f = clean_name(first)
    last_clean = clean_name(last)
    full = " ".join(p for p in (f, last_clean) if p)
    account.first_name = f or None  # type: ignore[assignment]
    account.last_name = last_clean or None  # type: ignore[assignment]
    account.name = full or None  # type: ignore[assignment]


def set_account_full_name(account: Account, full: str | None) -> None:
    """For callers that only have one full name (Users page, invites, Google)."""
    first, last = split_full_name(full)
    set_account_name(account, first, last)


def first_name_of(first_name: str | None, full: str | None) -> str | None:
    """The greeting name: first_name, or the first word of the full name for
    any account the 072 backfill has not reached."""
    f = clean_name(first_name)
    if f:
        return f
    first, _ = split_full_name(full)
    return first or None
