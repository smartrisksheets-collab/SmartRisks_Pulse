# app/api/v1/routes/submissions.py

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_active_tenant, get_db, require_permission
from app.core.exceptions import ResourceNotFoundError
from app.schemas.submission import (
    PromoteRequest,
    PublicSubmitRequest,
    SubmissionTokenCreate,
    TriageCloseRequest,
    TriageMergeRequest,
    TriageRerouteRequest,
)
from app.services import submission as svc

router = APIRouter(tags=["submissions"])


# ── Public endpoints (no JWT) ─────────────────────────────────────────────────

@router.get("/submissions/form/{token}")
async def resolve_token(
    token: str,
    db:    AsyncSession = Depends(get_db),
):
    try:
        result = await svc.resolve_token_for_form(db, token)
        return {"data": result.model_dump(), "error": None, "meta": {}}
    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="This link is not available.")


@router.post("/submissions/form/{token}")
async def submit_form(
    token:   str,
    payload: PublicSubmitRequest,
    request: Request,
    db:      AsyncSession = Depends(get_db),
):
    submitter_ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    try:
        result = await svc.create_submission(db, token, payload, submitter_ip)
        return {"data": result.model_dump(), "error": None, "meta": {}}
    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="This link is not available.")
    except ValueError as exc:
        if "rate_limit_exceeded" in str(exc):
            raise HTTPException(
                status_code=429,
                detail="Too many submissions. Please try again later.",
            )
        raise HTTPException(status_code=400, detail=str(exc))


# ── Token management ──────────────────────────────────────────────────────────

@router.post("/submissions/tokens")
async def create_token(
    payload: SubmissionTokenCreate,
    claims:  dict = Depends(require_permission("manage_risks")),
    db:      AsyncSession = Depends(get_db),
):
    workspace_id = UUID(str(claims["active_tenant_id"]))
    issued_by    = UUID(str(claims["sub"]))
    result = await svc.create_token(db, workspace_id, issued_by, payload)
    return {"data": result.model_dump(), "error": None, "meta": {}}


@router.get("/submissions/tokens")
async def list_tokens(
    claims: dict = Depends(require_permission("manage_risks")),
    db:     AsyncSession = Depends(get_db),
):
    workspace_id = UUID(str(claims["active_tenant_id"]))
    result = await svc.list_tokens(db, workspace_id)
    return {"data": [r.model_dump() for r in result], "error": None, "meta": {}}


@router.post("/submissions/tokens/{token_id}/revoke")
async def revoke_token(
    token_id: UUID,
    claims:   dict = Depends(require_permission("manage_risks")),
    db:       AsyncSession = Depends(get_db),
):
    workspace_id = UUID(str(claims["active_tenant_id"]))
    await svc.revoke_token(db, workspace_id, token_id)
    return {"data": {"ok": True}, "error": None, "meta": {}}


# ── Triage ────────────────────────────────────────────────────────────────────

@router.get("/submissions/triage/count")
async def pending_count(
    claims: dict = Depends(require_permission("manage_risks")),
    db:     AsyncSession = Depends(get_db),
):
    workspace_id = UUID(str(claims["active_tenant_id"]))
    count = await svc.get_pending_count(db, workspace_id)
    return {"data": {"count": count}, "error": None, "meta": {}}


@router.get("/submissions/triage")
async def list_triage(
    claims: dict = Depends(require_permission("manage_risks")),
    db:     AsyncSession = Depends(get_db),
):
    workspace_id = UUID(str(claims["active_tenant_id"]))
    result = await svc.list_pending(db, workspace_id)
    return {"data": [r.model_dump() for r in result], "error": None, "meta": {}}


@router.get("/submissions/triage/{submission_id}")
async def get_submission(
    submission_id: UUID,
    claims:        dict = Depends(require_permission("manage_risks")),
    db:            AsyncSession = Depends(get_db),
):
    workspace_id = UUID(str(claims["active_tenant_id"]))
    result = await svc.get_submission(db, workspace_id, submission_id)
    return {"data": result.model_dump(), "error": None, "meta": {}}


@router.get("/submissions/triage/{submission_id}/duplicates")
async def get_duplicates(
    submission_id: UUID,
    claims:        dict = Depends(require_permission("manage_risks")),
    db:            AsyncSession = Depends(get_db),
):
    workspace_id = UUID(str(claims["active_tenant_id"]))
    sub = await svc.get_submission(db, workspace_id, submission_id)
    candidates = await svc.get_duplicate_candidates(db, workspace_id, sub.description)
    return {"data": candidates, "error": None, "meta": {}}


@router.post("/submissions/triage/{submission_id}/accept")
async def triage_accept(
    submission_id: UUID,
    claims:        dict = Depends(require_permission("manage_risks")),
    db:            AsyncSession = Depends(get_db),
):
    workspace_id     = UUID(str(claims["active_tenant_id"]))
    triaged_by_id    = UUID(str(claims["sub"]))
    triaged_by_email = str(claims.get("email", ""))
    result = await svc.triage_accept(db, workspace_id, submission_id, triaged_by_id, triaged_by_email)
    return {"data": result.model_dump(), "error": None, "meta": {}}


@router.post("/submissions/triage/{submission_id}/merge")
async def triage_merge(
    submission_id: UUID,
    payload:       TriageMergeRequest,
    claims:        dict = Depends(require_permission("manage_risks")),
    db:            AsyncSession = Depends(get_db),
):
    workspace_id     = UUID(str(claims["active_tenant_id"]))
    triaged_by_id    = UUID(str(claims["sub"]))
    triaged_by_email = str(claims.get("email", ""))
    result = await svc.triage_merge(db, workspace_id, submission_id, triaged_by_id, triaged_by_email, payload)
    return {"data": result.model_dump(), "error": None, "meta": {}}


@router.post("/submissions/triage/{submission_id}/reroute")
async def triage_reroute(
    submission_id: UUID,
    payload:       TriageRerouteRequest,
    claims:        dict = Depends(require_permission("manage_risks")),
    db:            AsyncSession = Depends(get_db),
):
    if "incident" not in claims.get("modules", []):
        raise HTTPException(
            status_code=400,
            detail="Reroute to incident is not available. The incident module is not enabled for this workspace.",
        )
    workspace_id     = UUID(str(claims["active_tenant_id"]))
    triaged_by_id    = UUID(str(claims["sub"]))
    triaged_by_email = str(claims.get("email", ""))
    result = await svc.triage_reroute(db, workspace_id, submission_id, triaged_by_id, triaged_by_email, payload)
    return {"data": result.model_dump(), "error": None, "meta": {}}


@router.post("/submissions/triage/{submission_id}/close")
async def triage_close(
    submission_id: UUID,
    payload:       TriageCloseRequest,
    claims:        dict = Depends(require_permission("manage_risks")),
    db:            AsyncSession = Depends(get_db),
):
    workspace_id     = UUID(str(claims["active_tenant_id"]))
    triaged_by_id    = UUID(str(claims["sub"]))
    triaged_by_email = str(claims.get("email", ""))
    result = await svc.triage_close(db, workspace_id, submission_id, triaged_by_id, triaged_by_email, payload)
    return {"data": result.model_dump(), "error": None, "meta": {}}


@router.post("/submissions/triage/{submission_id}/promote")
async def promote(
    submission_id: UUID,
    payload:       PromoteRequest,
    claims:        dict = Depends(require_permission("manage_risks")),
    db:            AsyncSession = Depends(get_db),
):
    workspace_id     = UUID(str(claims["active_tenant_id"]))
    triaged_by_id    = UUID(str(claims["sub"]))
    triaged_by_email = str(claims.get("email", ""))
    try:
        result = await svc.promote(db, workspace_id, submission_id, triaged_by_id, triaged_by_email, payload)
        return {"data": result, "error": None, "meta": {}}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))