# app/services/submission.py

from __future__ import annotations

import logging
import re
import secrets
from datetime import datetime, timezone
from uuid import UUID

import resend
from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ResourceNotFoundError
from app.models.account import Account
from app.models.incident import Incident
from app.models.rate_limit_counter import RateLimitCounter
from app.models.risk import Risk
from app.models.risk_submission import RiskSubmission
from app.models.submission_token import SubmissionToken
from app.schemas.incident import IncidentCreate
from app.schemas.risk import RiskCreate
from app.schemas.submission import (
    PromoteRequest,
    PublicSubmitRequest,
    PublicSubmitResponse,
    RiskSubmissionListItem,
    RiskSubmissionResponse,
    SubmissionTokenCreate,
    SubmissionTokenResponse,
    TokenResolveResponse,
    TriageCloseRequest,
    TriageMergeRequest,
    TriageRerouteRequest,
)
from app.services import incident as incident_svc
from app.services import lookup as lookup_svc
from app.services import risk as risk_svc

logger = logging.getLogger(__name__)


# ── Rate limiting ─────────────────────────────────────────────────────────────

async def _check_rate_limit(
    db: AsyncSession,
    key: str,
    window_seconds: int,
    limit: int,
) -> None:
    """Atomically increment counter. Raises ValueError if limit exceeded."""
    result = await db.execute(
        text("""
            INSERT INTO rate_limit_counters (key, window_start, count, updated_at)
            VALUES (:key, now(), 1, now())
            ON CONFLICT (key) DO UPDATE SET
              count = CASE
                WHEN rate_limit_counters.window_start
                     + (INTERVAL '1 second' * :window_seconds) < now()
                THEN 1
                ELSE rate_limit_counters.count + 1
              END,
              window_start = CASE
                WHEN rate_limit_counters.window_start
                     + (INTERVAL '1 second' * :window_seconds) < now()
                THEN now()
                ELSE rate_limit_counters.window_start
              END,
              updated_at = now()
            RETURNING count
        """),
        {"key": key, "window_seconds": window_seconds},
    )
    current = result.scalar_one()
    if current > limit:
        raise ValueError("rate_limit_exceeded")


# ── Token helpers ─────────────────────────────────────────────────────────────

async def _get_token_record(
    db: AsyncSession,
    token_str: str,
) -> SubmissionToken | None:
    result = await db.execute(
        select(SubmissionToken).where(SubmissionToken.token == token_str)
    )
    return result.scalar_one_or_none()


def _token_is_active(t: SubmissionToken) -> bool:
    if t.revoked_at is not None:
        return False
    if t.expires_at is not None:
        if t.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            return False
    return True


# ── Reference generation ──────────────────────────────────────────────────────

async def _generate_reference(db: AsyncSession, workspace_id: UUID) -> str:
    year = datetime.now(timezone.utc).strftime('%Y')
    result = await db.execute(
        select(func.count()).select_from(RiskSubmission)
        .where(RiskSubmission.workspace_id == workspace_id)
    )
    count = result.scalar_one() or 0
    return f"SUB-{year}-{str(count + 1).zfill(4)}"


# ── Notification emails ───────────────────────────────────────────────────────

def _init_resend() -> None:
    if not settings.RESEND_API_KEY:
        raise ValueError("RESEND_API_KEY is not configured")
    resend.api_key = settings.RESEND_API_KEY


def _send_acknowledgement(sub: RiskSubmission) -> None:
    try:
        _init_resend()
        html = f"""
        <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
          <div style="background:#1F2854;padding:20px 24px;border-radius:12px 12px 0 0;">
            <span style="color:#01b88e;font-weight:900;font-size:18px;">SmartRisk Pulse</span>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
            <p style="margin:0 0 12px;">Hi {str(sub.submitter_name or '')},</p>
            <p style="margin:0 0 12px;">
              Your submission has been received. Your reference number is
              <strong style="color:#1F2854;">{str(sub.reference or '')}</strong>.
            </p>
            <p style="margin:0 0 12px;">
              A member of the risk team will review your submission and follow up with an outcome.
            </p>
            <p style="margin:0;color:#64748b;font-size:13px;">Department: {str(sub.department or '')}</p>
          </div>
        </div>
        """
        params: resend.Emails.SendParams = {
            "from":    settings.RESEND_FROM_EMAIL,
            "to":      [str(sub.submitter_email or '')],
            "subject": f"Submission received — {str(sub.reference or '')}",
            "html":    html,
        }
        resend.Emails.send(params)
    except Exception:
        logger.exception("Failed to send acknowledgement email | ref=%s", sub.reference)


def _send_outcome_email(
    sub: RiskSubmission,
    outcome_label: str,
    note: str,
) -> None:
    try:
        _init_resend()
        html = f"""
        <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
          <div style="background:#1F2854;padding:20px 24px;border-radius:12px 12px 0 0;">
            <span style="color:#01b88e;font-weight:900;font-size:18px;">SmartRisk Pulse</span>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
            <p style="margin:0 0 12px;">Hi {str(sub.submitter_name or '')},</p>
            <p style="margin:0 0 12px;">
              Your submission <strong style="color:#1F2854;">{str(sub.reference or '')}</strong>
              has been reviewed. Outcome: <strong>{outcome_label}</strong>.
            </p>
            <p style="margin:0 0 12px;background:#f8fafc;border-left:3px solid #01b88e;
                      padding:10px 14px;border-radius:0 8px 8px 0;">
              {note}
            </p>
            <p style="margin:0;color:#64748b;font-size:13px;">
              Thank you for contributing to your organisation's risk management process.
            </p>
          </div>
        </div>
        """
        params: resend.Emails.SendParams = {
            "from":    settings.RESEND_FROM_EMAIL,
            "to":      [str(sub.submitter_email or '')],
            "subject": f"Submission outcome — {str(sub.reference or '')}",
            "html":    html,
        }
        resend.Emails.send(params)
    except Exception:
        logger.exception("Failed to send outcome email | ref=%s", sub.reference)


# ── Token management ──────────────────────────────────────────────────────────

async def create_token(
    db: AsyncSession,
    workspace_id: UUID,
    issued_by: UUID,
    payload: SubmissionTokenCreate,
) -> SubmissionTokenResponse:
    token_str = secrets.token_urlsafe(32)
    row = SubmissionToken(
        workspace_id=workspace_id,
        token=token_str,
        label=payload.label,
        department=payload.department,
        issued_by=issued_by,
        expires_at=payload.expires_at,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return SubmissionTokenResponse.model_validate(row)


async def list_tokens(
    db: AsyncSession,
    workspace_id: UUID,
) -> list[SubmissionTokenResponse]:
    result = await db.execute(
        select(SubmissionToken)
        .where(SubmissionToken.workspace_id == workspace_id)
        .order_by(SubmissionToken.issued_at.desc())
    )
    rows = result.scalars().all()
    return [SubmissionTokenResponse.model_validate(r) for r in rows]


async def revoke_token(
    db: AsyncSession,
    workspace_id: UUID,
    token_id: UUID,
) -> None:
    result = await db.execute(
        select(SubmissionToken)
        .where(SubmissionToken.id == token_id)
        .where(SubmissionToken.workspace_id == workspace_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise ResourceNotFoundError("Token not found")
    if row.revoked_at is not None:
        return
    row.revoked_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    await db.flush()


# ── Public form ───────────────────────────────────────────────────────────────

async def resolve_token_for_form(
    db: AsyncSession,
    token_str: str,
) -> TokenResolveResponse:
    """Returns label and department for form display. Same neutral error for all failure cases."""
    row = await _get_token_record(db, token_str)
    if not row or not _token_is_active(row):
        raise ResourceNotFoundError("inactive")
    return TokenResolveResponse(
        label=str(row.label or ''),
        department=str(row.department or ''),
    )


async def create_submission(
    db: AsyncSession,
    token_str: str,
    payload: PublicSubmitRequest,
    submitter_ip: str,
) -> PublicSubmitResponse:
    # Honeypot check — silent discard looks like success to bots
    if payload.website:
        return PublicSubmitResponse(
            reference="",
            message="Your submission has been received.",
        )

    token = await _get_token_record(db, token_str)
    if not token or not _token_is_active(token):
        raise ResourceNotFoundError("inactive")

    workspace_id: UUID = token.workspace_id  # type: ignore[assignment]

    # Rate limits
    await _check_rate_limit(db, f"ip:{submitter_ip}", 3600, 10)
    await _check_rate_limit(db, f"token:{token_str}", 86400, 100)

    reference = await _generate_reference(db, workspace_id)

    sub = RiskSubmission(
        workspace_id=workspace_id,
        token_id=token.id,
        reference=reference,
        submitter_name=payload.submitter_name,
        submitter_email=str(payload.submitter_email),
        department=str(token.department or ''),
        submission_type=payload.submission_type,
        description=payload.description,
        cause=payload.cause,
        affects=payload.affects,
        suggested_category=payload.suggested_category,
        existing_controls=payload.existing_controls,
        suggested_action=payload.suggested_action,
        submitter_urgency=payload.submitter_urgency,
        attachment_url=payload.attachment_url,
        status="pending",
        submitter_ip=submitter_ip,
    )
    db.add(sub)

    # Increment submission_count on token
    await db.execute(
        update(SubmissionToken)
        .where(SubmissionToken.id == token.id)
        .values(submission_count=SubmissionToken.submission_count + 1)
    )

    await db.flush()
    await db.refresh(sub)

    _send_acknowledgement(sub)

    logger.info("Submission created | ref=%s | workspace=%s", reference, workspace_id)
    return PublicSubmitResponse(
        reference=reference,
        message="Your submission has been received.",
    )


# ── Triage ────────────────────────────────────────────────────────────────────

async def get_pending_count(db: AsyncSession, workspace_id: UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(RiskSubmission)
        .where(RiskSubmission.workspace_id == workspace_id)
        .where(RiskSubmission.status == "pending")
    )
    return result.scalar_one() or 0


async def list_pending(
    db: AsyncSession,
    workspace_id: UUID,
) -> list[RiskSubmissionListItem]:
    result = await db.execute(
        select(RiskSubmission)
        .where(RiskSubmission.workspace_id == workspace_id)
        .where(RiskSubmission.status == "pending")
        .order_by(RiskSubmission.submitted_at.asc())
    )
    rows = result.scalars().all()
    return [RiskSubmissionListItem.model_validate(r) for r in rows]


async def get_submission(
    db: AsyncSession,
    workspace_id: UUID,
    submission_id: UUID,
) -> RiskSubmissionResponse:
    result = await db.execute(
        select(RiskSubmission)
        .where(RiskSubmission.id == submission_id)
        .where(RiskSubmission.workspace_id == workspace_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise ResourceNotFoundError("Submission not found")
    return RiskSubmissionResponse.model_validate(row)


async def get_duplicate_candidates(
    db: AsyncSession,
    workspace_id: UUID,
    description: str,
) -> list[dict[str, str]]:
    """Crude word-match against existing risk descriptions. Returns up to 3 risk IDs and snippets."""
    words = [
        w for w in re.split(r'\W+', description[:80])
        if len(w) > 4
    ]
    if not words:
        return []
    query = select(Risk.id, Risk.description).where(
        Risk.tenant_id == workspace_id
    ).where(Risk.deleted_at.is_(None))
    for word in words[:4]:
        query = query.where(Risk.description.ilike(f"%{word}%"))
    result = await db.execute(query.limit(3))
    rows = result.all()
    return [
        {"risk_id": str(r.id), "snippet": str(r.description or '')[:120]}
        for r in rows
    ]



async def _get_sub_or_404(
    db: AsyncSession,
    workspace_id: UUID,
    submission_id: UUID,
) -> RiskSubmission:
    result = await db.execute(
        select(RiskSubmission)
        .where(RiskSubmission.id == submission_id)
        .where(RiskSubmission.workspace_id == workspace_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise ResourceNotFoundError("Submission not found")
    return row


async def triage_accept(
    db: AsyncSession,
    workspace_id: UUID,
    submission_id: UUID,
    triaged_by_id: UUID,
    triaged_by_email: str,
) -> RiskSubmissionResponse:
    sub = await _get_sub_or_404(db, workspace_id, submission_id)
    sub.status = "accepted"  # type: ignore[assignment]
    sub.triaged_by = triaged_by_id  # type: ignore[assignment]
    sub.triaged_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    await db.flush()
    await db.refresh(sub)
    return RiskSubmissionResponse.model_validate(sub)


async def triage_merge(
    db: AsyncSession,
    workspace_id: UUID,
    submission_id: UUID,
    triaged_by_id: UUID,
    triaged_by_email: str,
    payload: TriageMergeRequest,
) -> RiskSubmissionResponse:
    sub = await _get_sub_or_404(db, workspace_id, submission_id)

    # Verify target risk exists in this workspace
    risk_result = await db.execute(
        select(Risk)
        .where(Risk.id == payload.target_risk_id)
        .where(Risk.tenant_id == workspace_id)
        .where(Risk.deleted_at.is_(None))
    )
    target = risk_result.scalar_one_or_none()
    if not target:
        raise ResourceNotFoundError("Target risk not found")

    # Append submission content to target risk comments
    existing = str(target.comments or '')
    appended = (
        f"{existing}\n\n[Merged from {str(sub.reference or '')} — "
        f"{str(sub.submitter_name or '')}, {str(sub.department or '')}]: "
        f"{str(sub.description or '')}"
    ).strip()
    target.comments = appended  # type: ignore[assignment]

    sub.status = "merged"  # type: ignore[assignment]
    sub.triaged_by = triaged_by_id  # type: ignore[assignment]
    sub.triaged_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    sub.triage_note = payload.note  # type: ignore[assignment]
    sub.promoted_risk_id = target.id  # type: ignore[assignment]

    await db.flush()
    await db.refresh(sub)

    _send_outcome_email(sub, "Merged into existing risk", payload.note)
    return RiskSubmissionResponse.model_validate(sub)


async def triage_reroute(
    db: AsyncSession,
    workspace_id: UUID,
    submission_id: UUID,
    triaged_by_id: UUID,
    triaged_by_email: str,
    payload: TriageRerouteRequest,
) -> RiskSubmissionResponse:
    sub = await _get_sub_or_404(db, workspace_id, submission_id)

    from datetime import date
    inc_payload = IncidentCreate(
        description=str(sub.description or ''),
        category=str(sub.suggested_category or 'General'),
        severity='Medium',
        reported_by=str(sub.submitter_name or ''),
        reported_at=date.today(),
        reporter_email=str(sub.submitter_email or ''),
        business_unit=str(sub.department or ''),
        root_cause=str(sub.cause or ''),
        analyst_notes=(
            f"Rerouted from submission {str(sub.reference or '')}. "
            f"Triage note: {payload.note}"
        ),
    )
    await incident_svc.create_incident(db, workspace_id, inc_payload, triaged_by_email)

    sub.status = "rerouted"  # type: ignore[assignment]
    sub.triaged_by = triaged_by_id  # type: ignore[assignment]
    sub.triaged_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    sub.triage_note = payload.note  # type: ignore[assignment]

    await db.flush()
    await db.refresh(sub)

    _send_outcome_email(sub, "Rerouted to incident register", payload.note)
    return RiskSubmissionResponse.model_validate(sub)


async def triage_close(
    db: AsyncSession,
    workspace_id: UUID,
    submission_id: UUID,
    triaged_by_id: UUID,
    triaged_by_email: str,
    payload: TriageCloseRequest,
) -> RiskSubmissionResponse:
    sub = await _get_sub_or_404(db, workspace_id, submission_id)

    sub.status = "closed"  # type: ignore[assignment]
    sub.triaged_by = triaged_by_id  # type: ignore[assignment]
    sub.triaged_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    sub.triage_note = payload.note  # type: ignore[assignment]

    await db.flush()
    await db.refresh(sub)

    _send_outcome_email(sub, "Not taken forward", payload.note)
    return RiskSubmissionResponse.model_validate(sub)


# ── Promotion ─────────────────────────────────────────────────────────────────

async def promote(
    db: AsyncSession,
    workspace_id: UUID,
    submission_id: UUID,
    triaged_by_id: UUID,
    triaged_by_email: str,
    payload: PromoteRequest,
) -> dict[str, str]:
    sub = await _get_sub_or_404(db, workspace_id, submission_id)
    if str(sub.status or '') != "accepted":
        raise ValueError("Only accepted submissions can be promoted")

    risk_payload = RiskCreate(
        category=payload.category,
        description=str(sub.description or ''),
        owner=payload.owner,
        treatment=payload.treatment,
        likelihood=payload.likelihood,
        impact_score=payload.impact_score,
        controls=payload.controls,
        mitigation_plan=payload.mitigation_plan,
        target_date=payload.target_date,
        owner_email=payload.owner_email,
        root_cause=str(sub.cause or '') or None,
        source='submitted',
    )
    risk_response = await risk_svc.create_risk(
        db, workspace_id, risk_payload, triaged_by_email
    )
    await lookup_svc.ensure_category(db, workspace_id, payload.category)

    # Link source_submission_id on the new risk
    await db.execute(
        update(Risk)
        .where(Risk.id == risk_response.id)
        .where(Risk.tenant_id == workspace_id)
        .values(source_submission_id=sub.id)
    )

    sub.status = "accepted"  # type: ignore[assignment]
    sub.promoted_risk_id = risk_response.id  # type: ignore[assignment]
    sub.triaged_by = triaged_by_id  # type: ignore[assignment]
    sub.triaged_at = datetime.now(timezone.utc)  # type: ignore[assignment]

    await db.flush()

    _send_outcome_email(
        sub,
        "Accepted into risk register",
        f"Your submission has been reviewed and added to the risk register as {risk_response.id}.",
    )

    return {"risk_id": risk_response.id, "reference": str(sub.reference or '')}