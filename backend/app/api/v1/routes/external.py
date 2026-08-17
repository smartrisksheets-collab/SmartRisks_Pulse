# app/api/v1/routes/external.py
"""
Public endpoints: no JWT required, only a valid tenant_id in query param.
Auth endpoints: require get_active_tenant (verified JWT + active workspace).
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from app.core.rate_limit import limiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_active_tenant, get_db
from app.core.exceptions import ResourceNotFoundError
from app.schemas.external import (
    ApproveRequest,
    ExternalIncidentSubmit,
    ExternalRiskSubmit,
    ExternalSubmitResponse,
    ReturnRequest,
)
from app.services import external as ext_svc
from app.services import lookup as lookup_svc

router = APIRouter(tags=["external"])


# ── PUBLIC — no auth ──────────────────────────────────────────────────────────

@router.post("/external/submit/risk", response_model=ExternalSubmitResponse)
@limiter.limit("10/minute")
async def submit_risk(
    request:   Request,
    tenant_id: UUID,
    payload:   ExternalRiskSubmit,
    db:        AsyncSession = Depends(get_db),
):
    """Accept a risk submission from an unauthenticated external user."""
    return await ext_svc.submit_risk(db, tenant_id, payload)


@router.post("/external/submit/incident", response_model=ExternalSubmitResponse)
@limiter.limit("10/minute")
async def submit_incident(
    request:   Request,
    tenant_id: UUID,
    payload:   ExternalIncidentSubmit,
    db:        AsyncSession = Depends(get_db),
):
    """Accept an incident submission from an unauthenticated external user."""
    return await ext_svc.submit_incident(db, tenant_id, payload)


@router.get("/external/lookups/{tenant_id}")
async def get_public_lookups(
    tenant_id: UUID,
    key:       str = "",
    db:        AsyncSession = Depends(get_db),
):
    """
    Return workspace lookup arrays for external form dropdown hydration.
    Optional ?key= param returns a single array by field name.
    No auth required.
    """
    try:
        lookups = await lookup_svc.get_lookups(db, tenant_id)
        data = lookups.model_dump(exclude={"updated_at"})
        if key:
            val = data.get(key)
            if val is None:
                raise HTTPException(status_code=404, detail=f"Lookup key '{key}' not found")
            return {"data": val, "error": None, "meta": {}}
        return {"data": data, "error": None, "meta": {}}
    except HTTPException:
        raise
    except ResourceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ── AUTH REQUIRED ─────────────────────────────────────────────────────────────

@router.get("/external/pending/count")
async def get_pending_count(
    claims: dict = Depends(get_active_tenant),
    db:     AsyncSession = Depends(get_db),
):
    tenant_id = UUID(str(claims["active_tenant_id"]))
    result = await ext_svc.get_pending_count(db, tenant_id)
    return {"data": result.model_dump(), "error": None, "meta": {}}


@router.get("/external/pending")
async def list_pending(
    claims: dict = Depends(get_active_tenant),
    db:     AsyncSession = Depends(get_db),
):
    tenant_id = UUID(str(claims["active_tenant_id"]))
    result = await ext_svc.list_pending(db, tenant_id)
    return {"data": result.model_dump(), "error": None, "meta": {}}


@router.post("/external/{submission_id}/approve")
async def approve_submission(
    submission_id: str,
    body:          ApproveRequest,
    claims:        dict = Depends(get_active_tenant),
    db:            AsyncSession = Depends(get_db),
):
    tenant_id      = UUID(str(claims["active_tenant_id"]))
    reviewer_email = str(claims.get("sub", ""))
    try:
        result = await ext_svc.approve_submission(
            db, tenant_id, submission_id, reviewer_email, body.reviewer_notes
        )
        return {"data": result, "error": None, "meta": {}}
    except ResourceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/external/{submission_id}/return")
async def return_submission(
    submission_id: str,
    body:          ReturnRequest,
    claims:        dict = Depends(get_active_tenant),
    db:            AsyncSession = Depends(get_db),
):
    tenant_id      = UUID(str(claims["active_tenant_id"]))
    reviewer_email = str(claims.get("sub", ""))
    try:
        await ext_svc.return_submission(
            db, tenant_id, submission_id, reviewer_email, body.return_message
        )
        return {"data": {"ok": True}, "error": None, "meta": {}}
    except ResourceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))