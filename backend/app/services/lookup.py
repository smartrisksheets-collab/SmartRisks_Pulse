# app/services/lookup.py

import uuid
from uuid import UUID

from sqlalchemy import func, select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.incident import Incident
from app.models.lookup import Lookup
from app.models.risk import Risk
from app.schemas.lookup import LookupResponse, LookupPatch

# Mirrors GAS LOOKUP_DEFAULTS exactly
_DEFAULTS: dict[str, list[str]] = {
    'category':          ['Strategic', 'Operational', 'Financial', 'Compliance', 'Reputational', 'Technical'],
    'treatment':         ['Mitigate', 'Avoid', 'Transfer', 'Accept'],
    'risk_owner':        [],
    'incident_category': ['Cybersecurity', 'IT Operations', 'Physical Security', 'Data Protection', 'Compliance', 'Other'],
    'incident_severity': ['Low', 'Medium', 'High', 'Very High'],
    'business_unit':     [],
}


async def _get_or_create(db: AsyncSession, tenant_id: UUID) -> Lookup:
    result = await db.execute(
        select(Lookup).where(Lookup.tenant_id == tenant_id)
    )
    row = result.scalar_one_or_none()

    if row is None:
        row = Lookup(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            category=_DEFAULTS['category'],
            treatment=_DEFAULTS['treatment'],
            risk_owner=_DEFAULTS['risk_owner'],
            incident_category=_DEFAULTS['incident_category'],
            incident_severity=_DEFAULTS['incident_severity'],
            business_unit=_DEFAULTS['business_unit'],
        )
        db.add(row)
        await db.flush()
        await db.refresh(row)

    return row


def _merge_defaults(row: Lookup) -> LookupResponse:
    """Return defaults for any array that is null or empty in the DB."""
    def pick(field: str, val: list[str] | None) -> list[str]:
        return val if val else _DEFAULTS.get(field, [])

    return LookupResponse(
        category=pick('category', row.category),           # type: ignore[arg-type]
        treatment=pick('treatment', row.treatment),         # type: ignore[arg-type]
        risk_owner=pick('risk_owner', row.risk_owner),     # type: ignore[arg-type]
        incident_category=pick('incident_category', row.incident_category), # type: ignore[arg-type]
        incident_severity=pick('incident_severity', row.incident_severity), # type: ignore[arg-type]
        business_unit=pick('business_unit', row.business_unit), # type: ignore[arg-type]
        updated_at=row.updated_at,                         # type: ignore[arg-type]
    )


_USAGE_MAP: dict[str, tuple[type, str]] = {
    "risk_owner":        (Risk,     "owner"),
    "category":          (Risk,     "category"),
    "treatment":         (Risk,     "treatment"),
    "incident_category": (Incident, "category"),
    "incident_severity": (Incident, "severity"),
}


async def check_lookup_usage(
    db: AsyncSession, tenant_id: UUID, field: str, value: str
) -> int:
    if field not in _USAGE_MAP:
        return 0
    Model, col = _USAGE_MAP[field]
    col_attr = getattr(Model, col)
    result = await db.execute(
        select(func.count())
        .where(Model.tenant_id == tenant_id)  # type: ignore[arg-type]
        .where(col_attr == value)
        .where(Model.deleted_at.is_(None))  # type: ignore[union-attr]
    )
    return result.scalar() or 0


async def get_lookups(db: AsyncSession, tenant_id: UUID) -> LookupResponse:
    row = await _get_or_create(db, tenant_id)
    return _merge_defaults(row)


async def patch_lookups(
    db: AsyncSession,
    tenant_id: UUID,
    patch: LookupPatch,
) -> LookupResponse:
    row = await _get_or_create(db, tenant_id)

    patch_data = patch.model_dump(exclude_none=True)

    # Capture old values before overwriting
    old: dict[str, set[str]] = {
        f: set(getattr(row, f) or []) for f in _USAGE_MAP
    }

    for field, value in patch_data.items():
        setattr(row, field, value)

    # Cascade: null out removed values on risks and incidents
    for lookup_field, (Model, col) in _USAGE_MAP.items():
        if lookup_field not in patch_data:
            continue
        removed = old[lookup_field] - set(patch_data[lookup_field])
        for val in removed:
            await db.execute(
                sa_update(Model)
                .where(Model.tenant_id == tenant_id)  # type: ignore[arg-type]
                .where(getattr(Model, col) == val)
                .values({col: None})
            )

    await db.flush()
    await db.refresh(row)
    return _merge_defaults(row)