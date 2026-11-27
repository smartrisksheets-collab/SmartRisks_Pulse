"""
Setup wizard service.

The wizard saves each step to a draft that belongs to the account (no
workspace exists yet). Finish creates the workspace, its categories and its
appetite thresholds in the request's one transaction, then deletes the draft,
so a failure part way leaves nothing behind (decision of 2026-08-23).
"""

from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundError, ValidationError, WorkspaceLimitError
from app.models.account import Account
from app.models.audit_log import AuditLog
from app.models.onboarding_draft import OnboardingDraft
from app.models.tenant import Tenant
from app.models.workspace_member import WorkspaceMember
from app.schemas.appetite import AppetiteThresholdUpsert
from app.schemas.lookup import LookupPatch
from app.schemas.onboarding import (
    MAX_CATEGORIES,
    OnboardingBand,
    OnboardingData,
    OnboardingDraftResponse,
    OnboardingDraftSave,
    OnboardingFinishResponse,
    OnboardingOptions,
    OnboardingSuggestion,
)
from app.schemas.user import CreateWorkspaceRequest
from app.services.appetite import upsert_appetite
from app.services.lookup import _DEFAULTS as LOOKUP_DEFAULTS
from app.services.lookup import patch_lookups
from app.services.matrix_config import _DEFAULTS as MATRIX_DEFAULTS

# The one sector list. The wizard and Settings both read it from here.
SECTORS: list[str] = [
    "Banking",
    "Microfinance",
    "Asset management",
    "Other Financial Services",
    "Oil & gas",
    "Manufacturing",
    "Technology",
    "Government",
    "Energy",
    "Other",
]

MIN_CATEGORIES = 3
APPETITE_NOTE = "SmartRisk suggested thresholds. Set in line with your board-approved risk appetite."

# SmartRisk suggested starting thresholds per sector, from "SmartRisk suggested
# appetite thresholds by sector" (November 2026, SmartRisk's own experience).
# Each is the highest residual score allowed on the default 5 x 5 matrix.
# Not regulatory limits: each board sets and approves its own appetite.
SUGGESTIONS_MATRIX_MAX = 25
SECTOR_SUGGESTIONS: dict[str, list[tuple[str, int]]] = {
    "Banking": [("Credit", 9), ("Liquidity", 6), ("Market", 8), ("Operational", 8), ("Third Party", 8),
                ("Technology", 6), ("Fraud & AML", 4), ("Regulatory", 4)],
    "Microfinance": [("Credit", 10), ("Liquidity", 6), ("Operational", 8), ("Third Party", 8), ("Technology", 6),
                     ("Fraud & AML", 4), ("Regulatory", 4)],
    "Asset management": [("Market", 10), ("Liquidity", 6), ("Operational", 8), ("Third Party", 8), ("Technology", 6),
                         ("Fraud & AML", 4), ("Regulatory", 4)],
    "Other Financial Services": [("Credit", 9), ("Market", 9), ("Liquidity", 6), ("Operational", 8),
                                 ("Third Party", 8), ("Technology", 6), ("Fraud & AML", 4), ("Regulatory", 4)],
    "Oil & gas": [("Commodity price", 10), ("Operational", 8), ("Third Party", 8), ("Security", 6),
                  ("Health & Safety", 4), ("Environmental", 4), ("Regulatory", 4)],
    "Manufacturing": [("Market & FX", 10), ("Supply chain", 8), ("Operational", 8), ("Product quality", 6),
                      ("Technology", 6), ("Health & Safety", 4), ("Regulatory", 4)],
    "Technology": [("Product & delivery", 10), ("Financial", 8), ("Third Party", 8), ("People", 8),
                   ("Service resilience", 6), ("Cyber security", 5), ("Data Protection", 4), ("Regulatory", 4)],
    "Government": [("Service delivery", 8), ("Operational", 8), ("People", 8), ("Budget & funding", 6),
                   ("Procurement & third party", 6), ("Technology", 6), ("Fraud & corruption", 4),
                   ("Data Protection", 4), ("Regulatory", 4)],
    "Energy": [("Revenue & collections", 10), ("Operational & assets", 8), ("Third Party", 8), ("Security", 6),
               ("Health & Safety", 4), ("Environmental", 4), ("Regulatory", 4)],
    "Other": [("Strategic", 10), ("Financial", 8), ("Operational", 8), ("Third Party", 8), ("People", 8),
              ("Regulatory", 4)],
}

# The full guide, served by the frontend from public/docs/.
APPETITE_GUIDE_URL = "/docs/smartrisk-suggested-appetite-thresholds.pdf"

# New workspaces start on these defaults; all of them can be changed in Settings.
_NEW_WORKSPACE_DEFAULTS = dict(
    framework="ISO 31000",
    currency="₦",
    timezone="Africa/Lagos",
    date_format="DD/MM/YYYY",
)


def _matrix_max() -> int:
    return int(MATRIX_DEFAULTS["likelihood_scale"]) * int(MATRIX_DEFAULTS["impact_scale"])  # type: ignore[call-overload]


def appetite_start(matrix_max: int) -> int:
    """The middle of the scale, rounded up: 13 on 1 to 25, 8 on 1 to 16."""
    return (matrix_max + 1) // 2


def _default_bands() -> list[OnboardingBand]:
    d = MATRIX_DEFAULTS
    rows = [
        (d["band_1_label"], d["band_low_min"], d["band_low_max"]),
        (d["band_2_label"], d["band_medium_min"], d["band_medium_max"]),
        (d["band_3_label"], d["band_high_min"], d["band_high_max"]),
        (d["band_4_label"], d["band_critical_min"], d["band_critical_max"]),
        (d["band_5_label"], d["band_extreme_min"], d["band_extreme_max"]),
    ]
    count = int(d["band_count"])  # type: ignore[call-overload]
    return [OnboardingBand(label=str(lbl), min=int(lo), max=int(hi)) for lbl, lo, hi in rows[:count]]  # type: ignore[call-overload]


def band_for_score(bands: list[OnboardingBand], matrix_max: int) -> list[int]:
    """Band number (1-based) for scores 1..matrix_max. The highest band wins
    where ranges overlap, as in matrix_config's re-classification."""
    out: list[int] = []
    for score in range(1, matrix_max + 1):
        idx = 1
        for i, b in enumerate(bands, start=1):
            if score >= b.min:
                idx = i
        out.append(idx)
    return out


def get_options() -> OnboardingOptions:
    mx = _matrix_max()
    bands = _default_bands()
    return OnboardingOptions(
        sectors=list(SECTORS),
        default_categories=list(LOOKUP_DEFAULTS["category"]),
        min_categories=MIN_CATEGORIES,
        max_categories=MAX_CATEGORIES,
        matrix_max=mx,
        bands=bands,
        band_for_score=band_for_score(bands, mx),
        appetite_start=appetite_start(mx),
        appetite_note=APPETITE_NOTE,
        suggestions=(
            {s: [OnboardingSuggestion(category=c, threshold=t) for c, t in rows]
             for s, rows in SECTOR_SUGGESTIONS.items()}
            if mx == SUGGESTIONS_MATRIX_MAX else {}
        ),
        guide_url=APPETITE_GUIDE_URL,
    )


def _clean(value: str | None) -> str:
    return " ".join(str(value or "").split())


def _clean_data(data: OnboardingData) -> OnboardingData:
    """Trim names, drop blank and duplicate categories (case-insensitive, first
    spelling kept) and appetite entries for categories no longer picked."""
    seen: set[str] = set()
    cats: list[str] = []
    for c in data.categories:
        name = _clean(c)
        if name and name.lower() not in seen:
            seen.add(name.lower())
            cats.append(name)
    appetite = {
        name: int(val)
        for name in cats
        for key, val in data.appetite.items()
        if _clean(key).lower() == name.lower()
    }
    return OnboardingData(
        workspace_name=_clean(data.workspace_name) or None,
        org_name=_clean(data.org_name) or None,
        sector=_clean(data.sector) or None,
        categories=cats,
        appetite=appetite,
        appetite_skipped=data.appetite_skipped,
    )


# ── Draft ────────────────────────────────────────────────────────────────────

def _to_response(row: OnboardingDraft) -> OnboardingDraftResponse:
    return OnboardingDraftResponse(
        step=int(row.step),  # type: ignore[arg-type]
        data=OnboardingData.model_validate(dict(row.data or {})),  # type: ignore[arg-type]
        updated_at=row.updated_at,  # type: ignore[arg-type]
    )


async def get_draft(db: AsyncSession, account_id: UUID) -> OnboardingDraftResponse | None:
    row = (await db.execute(
        select(OnboardingDraft).where(OnboardingDraft.account_id == account_id)
    )).scalar_one_or_none()
    return _to_response(row) if row is not None else None


async def save_draft(db: AsyncSession, account_id: UUID, payload: OnboardingDraftSave) -> OnboardingDraftResponse:
    data = _clean_data(payload.data)
    row = (await db.execute(
        select(OnboardingDraft).where(OnboardingDraft.account_id == account_id).with_for_update()
    )).scalar_one_or_none()
    if row is None:
        row = OnboardingDraft(account_id=account_id, step=payload.step, data=data.model_dump())
        db.add(row)
    else:
        row.step = payload.step  # type: ignore[assignment]
        row.data = data.model_dump()  # type: ignore[assignment]
        row.updated_at = func.now()  # type: ignore[assignment]
    await db.flush()
    await db.refresh(row)
    return _to_response(row)


# ── Workspace creation (shared with POST /api/v1/workspaces) ─────────────────

async def create_workspace(
    db: AsyncSession,
    account_id: UUID,
    email: str,
    payload: CreateWorkspaceRequest,
) -> Tenant:
    """Create a workspace owned by the account. The one place the workspace
    limit is checked."""
    account = (await db.execute(select(Account).where(Account.id == account_id))).scalar_one_or_none()
    limit = int(account.max_workspaces) if account else 1  # type: ignore[arg-type]

    owned_count = await db.scalar(
        select(func.count()).select_from(Tenant).where(Tenant.created_by == account_id)
    ) or 0
    if owned_count >= limit:
        raise WorkspaceLimitError(
            f"Your plan allows a maximum of {limit} workspace(s). "
            f"Contact support to increase your limit."
        )

    ws_settings: dict = {}
    if payload.org_name:
        ws_settings["organization"] = payload.org_name

    is_enterprise = limit > 1
    initial_expiry = date.today() + timedelta(days=365) if is_enterprise else None

    tenant = Tenant(
        name=payload.name,
        industry=payload.industry,
        org_size=payload.org_size,
        framework=payload.framework,
        timezone=payload.timezone,
        date_format=payload.date_format,
        currency_symbol=payload.currency or "₦",
        workspace_settings=ws_settings or None,
        created_by=account_id,
        plan="PAID" if is_enterprise else "TRIAL",
        payment_active=is_enterprise,  # type: ignore[assignment]
        plan_expires_at=initial_expiry,  # type: ignore[assignment]
    )
    db.add(tenant)
    await db.flush()

    db.add(WorkspaceMember(
        account_id=account_id,
        tenant_id=tenant.id,
        role="Owner",
        status="ACTIVE",
        invited_by="SYSTEM",
    ))
    db.add(AuditLog(
        tenant_id=tenant.id,
        user_email=email,
        action="CREATE_WORKSPACE",
        module="Workspace",
        record_id=str(tenant.id),
        summary=f"Created workspace: {payload.name}",
    ))
    await db.flush()
    return tenant


# ── Finish ───────────────────────────────────────────────────────────────────

def _check_ready(data: OnboardingData, matrix_max: int) -> None:
    if not data.workspace_name:
        raise ValidationError("Give your workspace a name.")
    if data.sector is not None and data.sector not in SECTORS:
        raise ValidationError("Choose a sector from the list.")
    if len(data.categories) < MIN_CATEGORIES:
        raise ValidationError(f"Pick at least {MIN_CATEGORIES} risk categories.")
    if not data.appetite_skipped:
        for cat, val in data.appetite.items():
            if val < 1 or val > matrix_max:
                raise ValidationError(f"The appetite for {cat} must be between 1 and {matrix_max}.")


async def finish(db: AsyncSession, account_id: UUID, email: str) -> OnboardingFinishResponse:
    row = (await db.execute(
        select(OnboardingDraft).where(OnboardingDraft.account_id == account_id).with_for_update()
    )).scalar_one_or_none()
    if row is None:
        # Already finished (a second click), or nothing was saved.
        raise ResourceNotFoundError("There is no setup in progress. Your workspace may already be created.")

    data = _clean_data(OnboardingData.model_validate(dict(row.data or {})))  # type: ignore[arg-type]
    mx = _matrix_max()
    _check_ready(data, mx)

    tenant = await create_workspace(db, account_id, email, CreateWorkspaceRequest(
        name=str(data.workspace_name),
        org_name=data.org_name,
        industry=data.sector,
        **_NEW_WORKSPACE_DEFAULTS,
    ))
    tenant_id: UUID = tenant.id  # type: ignore[assignment]

    # The picked categories replace the defaults (decision of 2026-11-27).
    await patch_lookups(db, tenant_id, LookupPatch(category=data.categories))

    saved = 0
    if not data.appetite_skipped:
        for cat in data.categories:
            val = data.appetite.get(cat)
            if val is None:
                continue
            await upsert_appetite(db, tenant_id, AppetiteThresholdUpsert(category=cat, threshold=val), email)
            saved += 1

    await db.execute(delete(OnboardingDraft).where(OnboardingDraft.id == row.id))
    await db.flush()
    return OnboardingFinishResponse(
        workspace_id=str(tenant_id),
        workspace_name=str(tenant.name),
        categories=data.categories,
        appetite_saved=saved,
    )
