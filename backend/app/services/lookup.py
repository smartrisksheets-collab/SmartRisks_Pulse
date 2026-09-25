# app/services/lookup.py

import uuid
from uuid import UUID

from sqlalchemy import func, select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
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


def _effective_list(field: str, val: object) -> list[str]:
    """Stored list, or the default when the stored list is null or empty."""
    if isinstance(val, list) and val:
        return [str(v) for v in val]
    return list(_DEFAULTS.get(field, []))


def _clean_map(
    raw: object,
    incident_categories: list[str],
    risk_categories: list[str],
) -> dict[str, list[str]]:
    """Drop keys and values that no longer exist in the lookup lists."""
    if not isinstance(raw, dict):
        return {}
    inc_set = set(incident_categories)
    risk_set = set(risk_categories)
    cleaned: dict[str, list[str]] = {}
    for key, values in raw.items():
        if key not in inc_set or not isinstance(values, list):
            continue
        kept: list[str] = []
        for v in values:
            if isinstance(v, str) and v in risk_set and v not in kept:
                kept.append(v)
        cleaned[key] = kept
    return cleaned


def _validate_map(
    mapping: dict[str, list[str]],
    incident_categories: list[str],
    risk_categories: list[str],
) -> None:
    unknown_keys = sorted(k for k in mapping if k not in incident_categories)
    unknown_vals = sorted({v for vals in mapping.values() for v in vals if v not in risk_categories})
    if unknown_keys or unknown_vals:
        parts: list[str] = []
        if unknown_keys:
            parts.append(f"unknown incident categories: {', '.join(unknown_keys)}")
        if unknown_vals:
            parts.append(f"unknown risk categories: {', '.join(unknown_vals)}")
        raise ValidationError("Category mapping has " + "; ".join(parts) + ".")


def covering_risk_categories(
    incident_category: str,
    category_map: dict[str, list[str]],
    risk_categories: list[str],
) -> list[str]:
    """Risk categories that cover an incident category.

    Explicit mapping wins, including an explicit empty list (a real gap).
    With no mapping entry, falls back to a case-insensitive same-name match.
    """
    if incident_category in category_map:
        return list(category_map[incident_category])
    target = incident_category.strip().lower()
    return [c for c in risk_categories if c.strip().lower() == target][:1]


def _merge_defaults(row: Lookup) -> LookupResponse:
    """Return defaults for any array that is null or empty in the DB."""
    risk_cats = _effective_list('category', row.category)
    inc_cats = _effective_list('incident_category', row.incident_category)

    return LookupResponse(
        category=risk_cats,
        treatment=_effective_list('treatment', row.treatment),
        risk_owner=_effective_list('risk_owner', row.risk_owner),
        incident_category=inc_cats,
        incident_severity=_effective_list('incident_severity', row.incident_severity),
        business_unit=_effective_list('business_unit', row.business_unit),
        incident_category_map=_clean_map(row.incident_category_map, inc_cats, risk_cats),
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


async def ensure_category(db: AsyncSession, tenant_id: UUID, category: str) -> None:
    """Append category to the lookup array if it is not already present.
    Checks case-insensitively to avoid near-duplicate entries."""
    if not category:
        return
    row = await _get_or_create(db, tenant_id)
    existing: list[str] = list(row.category or [])  # type: ignore[arg-type]
    normalised = category.strip()
    already_present = any(e.strip().lower() == normalised.lower() for e in existing)
    if not already_present:
        existing.append(normalised)
        row.category = existing  # type: ignore[assignment]
        await db.flush()


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
    map_patch: dict[str, list[str]] | None = patch_data.pop('incident_category_map', None)

    # Lists as they will stand after this patch, used to validate and prune the map
    final_inc = _effective_list('incident_category', patch_data.get('incident_category', row.incident_category))
    final_risk = _effective_list('category', patch_data.get('category', row.category))
    if map_patch is not None:
        _validate_map(map_patch, final_inc, final_risk)

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

    map_source = map_patch if map_patch is not None else row.incident_category_map
    row.incident_category_map = _clean_map(map_source, final_inc, final_risk)  # type: ignore[assignment]

    await db.flush()
    await db.refresh(row)
    return _merge_defaults(row)