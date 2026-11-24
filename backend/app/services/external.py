# app/services/external.py
"""
Handles external (unauthenticated) risk and incident submissions.
Translates logic from ExternalRiskService.gs.
Source: ExternalRiskService.gs — api_submitExternalRisk, api_approveExternalRisk,
        api_returnExternalRisk, api_getPendingRisks, api_getPendingRiskCount.
"""
from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import PermissionDeniedError, ResourceNotFoundError, ValidationError
from app.models.external_submission import ExternalSubmission
from app.models.tenant import Tenant
from app.schemas.external import (
    ExternalRiskSubmit,
    ExternalIncidentSubmit,
    ExternalSubmitResponse,
    PendingSubmissionItem,
    PendingListResponse,
    PendingCountResponse,
)
from app.schemas.risk import RiskCreate
from app.schemas.incident import IncidentCreate
from app.models.audit_log import AuditLog
from app.services import risk as risk_svc
from app.services import incident as incident_svc
from app.services.clock import latest_today
from app.services.incident_severity import public_levels

logger = logging.getLogger(__name__)


async def _get_tenant(db: AsyncSession, tenant_id: UUID) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise ResourceNotFoundError("Workspace not found")
    return tenant


async def submit_risk(
    db:        AsyncSession,
    tenant_id: UUID,
    payload:   ExternalRiskSubmit,
) -> ExternalSubmitResponse:
    """Store an external risk submission in the pending queue. No auth required."""
    tenant = await _get_tenant(db, tenant_id)

    sub = ExternalSubmission(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        submission_type="risk",
        payload=payload.model_dump(),
        submitter_email=payload.submitter_email or None,
        status="PENDING",
    )
    db.add(sub)
    await db.flush()
    await db.refresh(sub)

    if payload.submitter_email and "@" in payload.submitter_email:
        try:
            from app.services.email import send_submission_confirmation
            send_submission_confirmation(
                to=payload.submitter_email,
                submitter_name=payload.submitter_name,
                submission_id=str(sub.id),
                submission_type="risk",
                category=payload.category,
                description=payload.description,
                org_name=str(tenant.name or "SmartRisk GRC"),
            )
        except Exception as exc:
            logger.warning("Submission confirmation email failed: %s", exc)

    return ExternalSubmitResponse(id=str(sub.id), status="PENDING")


async def submit_incident(
    db:        AsyncSession,
    tenant_id: UUID,
    payload:   ExternalIncidentSubmit,
) -> ExternalSubmitResponse:
    """Store an external incident submission in the pending queue. No auth required."""
    tenant = await _get_tenant(db, tenant_id)

    labels = [lv["label"] for lv in await public_levels(db, tenant_id)]
    if payload.severity not in labels:
        raise ValidationError("Choose one of the listed severity levels.")

    sub = ExternalSubmission(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        submission_type="incident",
        payload=payload.model_dump(),
        submitter_email=payload.reporter_email or None,
        status="PENDING",
    )
    db.add(sub)
    await db.flush()
    await db.refresh(sub)

    if payload.reporter_email and "@" in payload.reporter_email:
        try:
            from app.services.email import send_submission_confirmation
            send_submission_confirmation(
                to=payload.reporter_email,
                submitter_name=payload.reported_by,
                submission_id=str(sub.id),
                submission_type="incident",
                category=payload.category,
                description=payload.description,
                org_name=str(tenant.name or "SmartRisk GRC"),
            )
        except Exception as exc:
            logger.warning("Submission confirmation email failed: %s", exc)

    return ExternalSubmitResponse(id=str(sub.id), status="PENDING")


async def get_public_severity(db: AsyncSession, tenant_id: UUID) -> list[dict[str, str]]:
    """Severity choices for the public incident form. 404 for an unknown workspace."""
    await _get_tenant(db, tenant_id)
    return await public_levels(db, tenant_id)


def _incident_dt(day: str, at: str) -> datetime | None:
    """When the incident happened, from the form's date and optional time.

    Stored the way the internal incident form stores it: the wall time as entered,
    marked UTC, so it reads back unchanged. Unreadable or future values give None.
    """
    try:
        d = date.fromisoformat(day.strip())
    except ValueError:
        return None
    if d > latest_today():
        return None
    hh, mm = 0, 0
    parts = at.strip().split(":")
    if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
        h, m = int(parts[0]), int(parts[1])
        if 0 <= h < 24 and 0 <= m < 60:
            hh, mm = h, m
    return datetime(d.year, d.month, d.day, hh, mm, tzinfo=timezone.utc)


# Which permission reviews which submission type. One place, used by the
# list, the count, approve and return.
_REVIEW_PERMISSION: dict[str, str] = {
    "risk":     "manage_risks",
    "incident": "manage_incidents",
}


def reviewable_types(permissions: dict[str, Any]) -> list[str]:
    """Submission types this member may see and review."""
    return [t for t, perm in _REVIEW_PERMISSION.items() if permissions.get(perm)]


def _require_review_permission(sub_type: str, permissions: dict[str, Any]) -> None:
    perm = _REVIEW_PERMISSION.get(sub_type, "manage_risks")
    if not permissions.get(perm):
        raise PermissionDeniedError(f"Permission denied: {perm} required to review this submission")


async def list_pending(
    db:        AsyncSession,
    tenant_id: UUID,
    types:     list[str],
) -> PendingListResponse:
    """Return PENDING submissions of the given types for a tenant, newest first."""
    if not types:
        return PendingListResponse(items=[], total=0)
    result = await db.execute(
        select(ExternalSubmission)
        .where(
            ExternalSubmission.tenant_id == tenant_id,
            ExternalSubmission.status == "PENDING",
            func.coalesce(ExternalSubmission.submission_type, "risk").in_(types),
        )
        .order_by(ExternalSubmission.created_at.desc())
    )
    rows = result.scalars().all()

    items: list[PendingSubmissionItem] = []
    for r in rows:
        p: dict[str, Any] = dict(r.payload) if r.payload is not None else {}  # type: ignore[arg-type]
        submitter_name = str(p.get("submitter_name", "") or p.get("reported_by", ""))
        items.append(PendingSubmissionItem(
            id=str(r.id),
            submission_type=str(r.submission_type or "risk"),
            submitter_name=submitter_name,
            submitter_email=str(r.submitter_email or ""),
            submitted_at=r.created_at,  # type: ignore[arg-type]
            category=str(p.get("category", "")),
            description=str(p.get("description", "")),
            payload=p,
        ))

    return PendingListResponse(items=items, total=len(items))


async def get_pending_count(
    db:        AsyncSession,
    tenant_id: UUID,
    types:     list[str],
) -> PendingCountResponse:
    """Return count of PENDING submissions of the given types for the badge."""
    if not types:
        return PendingCountResponse(count=0)
    result = await db.execute(
        select(func.count()).select_from(ExternalSubmission)
        .where(
            ExternalSubmission.tenant_id == tenant_id,
            ExternalSubmission.status == "PENDING",
            func.coalesce(ExternalSubmission.submission_type, "risk").in_(types),
        )
    )
    count = result.scalar_one()
    return PendingCountResponse(count=int(count or 0))


async def approve_submission(
    db:             AsyncSession,
    tenant_id:      UUID,
    submission_id:  str,
    reviewer_email: str,
    permissions:    dict[str, Any],
    reviewer_notes: str = "",
) -> dict[str, Any]:
    """
    Promote a pending submission to the risks or incidents table.
    Mirrors api_approveExternalRisk in ExternalRiskService.gs.
    Transaction boundary owned by get_db — all writes share one session.
    """
    result = await db.execute(
        select(ExternalSubmission).where(
            ExternalSubmission.id == UUID(submission_id),
            ExternalSubmission.tenant_id == tenant_id,
            ExternalSubmission.status == "PENDING",
        )
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        raise ResourceNotFoundError("Submission not found or already reviewed")

    p: dict[str, Any] = dict(sub.payload) if sub.payload is not None else {}  # type: ignore[arg-type]
    sub_type = str(sub.submission_type or "risk")
    _require_review_permission(sub_type, permissions)
    created_id: str

    if sub_type == "risk":
        risk_payload = RiskCreate(
            category=str(p.get("category") or "Uncategorised"),
            description=str(p.get("description") or ""),
            owner=str(p.get("submitter_name") or "External"),
            owner_email=str(p.get("submitter_email") or "") or None,
            treatment=str(p.get("treatment") or "Mitigate"),
            likelihood=int(p.get("likelihood") or 3),
            impact_score=int(p.get("impact_score") or 3),
            primary_impact=str(p.get("primary_impact") or "") or None,
            controls=str(p.get("controls") or "") or None,
            comments=f"[External] {str(p.get('comments') or '')}".strip() or None,
            mitigation_status="Open",
            source="external",
        )
        risk = await risk_svc.create_risk(db, tenant_id, risk_payload, reviewer_email)
        created_id = str(risk.id)
    else:
        reported_at_raw = str(p.get("date_reported") or "")
        try:
            reported_at = date.fromisoformat(reported_at_raw)
        except ValueError:
            reported_at = date.today()
        # Submissions queued before the future-date check may still hold one.
        if reported_at > latest_today():
            reported_at = datetime.now(timezone.utc).date()

        raw_fi = str(p.get("financial_impact") or "")
        financial_impact: Decimal | None = None
        if raw_fi:
            # Strip currency symbols and commas before parsing
            cleaned = raw_fi.replace("$", "").replace(",", "").strip()
            try:
                financial_impact = Decimal(cleaned)
            except Exception:
                financial_impact = None

        inc_payload = IncidentCreate(
            title=str(p.get("title") or "") or None,
            description=str(p.get("description") or ""),
            category=str(p.get("category") or "Other"),
            severity=str(p.get("severity") or "Medium"),
            reported_by=str(p.get("reported_by") or "External"),
            reporter_email=str(p.get("reporter_email") or "") or None,
            reported_at=reported_at,
            channel=str(p.get("channel") or "") or None,
            incident_type=str(p.get("incident_type") or "") or None,
            affected_asset=str(p.get("affected_asset") or "") or None,
            business_unit=str(p.get("business_unit") or "") or None,
            immediate_actions=str(p.get("actions_taken") or "") or None,
            financial_impact=financial_impact,
            impact_confidence=str(p.get("impact_confidence") or "") or None,
            incident_dt=_incident_dt(str(p.get("incident_date") or ""), str(p.get("incident_time") or "")),
        )
        incident = await incident_svc.create_incident(db, tenant_id, inc_payload, reviewer_email)
        created_id = str(incident.id)

    # Mark approved on the submission record
    sub.status = "APPROVED"  # type: ignore[assignment]
    sub.reviewed_by = reviewer_email  # type: ignore[assignment]
    sub.reviewed_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    if reviewer_notes:
        sub.return_message = reviewer_notes  # type: ignore[assignment]
    db.add(AuditLog(
        tenant_id=tenant_id,
        user_email=reviewer_email,
        action="APPROVE",
        module=sub_type.capitalize(),
        record_id=submission_id,
        summary=f"Approved external {sub_type}: {submission_id} \u2192 {created_id}",
    ))
    await db.flush()

    # Non-blocking approval email
    submitter_email = str(sub.submitter_email or "")
    if "@" in submitter_email:
        try:
            from app.services.email import send_approval_email
            tenant = await db.get(Tenant, tenant_id)
            org_name = str(tenant.name if tenant else "SmartRisk GRC")
            send_approval_email(
                to=submitter_email,
                submitter_name=str(p.get("submitter_name") or p.get("reported_by") or "Team Member"),
                created_id=created_id,
                category=str(p.get("category") or ""),
                description=str(p.get("description") or ""),
                org_name=org_name,
            )
        except Exception as exc:
            logger.warning("Approval email failed: %s", exc)

    return {"created_id": created_id, "submission_type": sub_type}


async def return_submission(
    db:             AsyncSession,
    tenant_id:      UUID,
    submission_id:  str,
    reviewer_email: str,
    return_message: str,
    permissions:    dict[str, Any],
) -> None:
    """
    Mark a submission as Returned and email the submitter.
    Mirrors api_returnExternalRisk in ExternalRiskService.gs.
    """
    result = await db.execute(
        select(ExternalSubmission).where(
            ExternalSubmission.id == UUID(submission_id),
            ExternalSubmission.tenant_id == tenant_id,
            ExternalSubmission.status == "PENDING",
        )
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        raise ResourceNotFoundError("Submission not found or already reviewed")
    _require_review_permission(str(sub.submission_type or "risk"), permissions)

    p: dict[str, Any] = dict(sub.payload) if sub.payload is not None else {}  # type: ignore[arg-type]

    sub.status = "RETURNED"  # type: ignore[assignment]
    sub.reviewed_by = reviewer_email  # type: ignore[assignment]
    sub.reviewed_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    sub.return_message = return_message  # type: ignore[assignment]
    _sub_type = str(sub.submission_type or "risk").capitalize()
    db.add(AuditLog(
        tenant_id=tenant_id,
        user_email=reviewer_email,
        action="RETURN",
        module=_sub_type,
        record_id=submission_id,
        summary=f"Returned external {_sub_type.lower()} to {str(sub.submitter_email or '')}",
    ))
    await db.flush()

    submitter_email = str(sub.submitter_email or "")
    if "@" in submitter_email:
        try:
            from app.services.email import send_return_email
            tenant = await db.get(Tenant, tenant_id)
            org_name = str(tenant.name if tenant else "SmartRisk GRC")
            send_return_email(
                to=submitter_email,
                submitter_name=str(p.get("submitter_name") or p.get("reported_by") or "Team Member"),
                category=str(p.get("category") or ""),
                description=str(p.get("description") or ""),
                return_message=return_message,
                org_name=org_name,
            )
        except Exception as exc:
            logger.warning("Return email failed: %s", exc)