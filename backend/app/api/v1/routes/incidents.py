# app/api/v1/routes/incidents.py

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, get_active_tenant, require_module, require_permission
from app.schemas.incident import (
    IncidentCreate,
    IncidentUpdate,
    AIIncidentRequest,
    AIIncidentSuggestRequest,
)
from app.services import incident as incident_service
from app.services import ai_incident as ai_incident_service

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_module("incident")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    stats = await incident_service.get_stats(db, tenant_id)
    return {"data": stats, "error": None, "meta": {}}


@router.get("")
async def list_incidents(
    page: int               = Query(1, ge=1),
    page_size: int          = Query(10, ge=1, le=200),
    incident_id: str | None = Query(None),
    category: str | None    = Query(None),
    severity: str | None    = Query(None),
    status: str | None      = Query(None),
    business_unit: str | None = Query(None),
    search: str | None      = Query(None),
    db: AsyncSession        = Depends(get_db),
    claims: dict            = Depends(require_module("incident")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    result = await incident_service.list_incidents(
        db, tenant_id, page, page_size,
        incident_id, category, severity, status, business_unit, search,
    )
    return {
        "data": result.items,
        "error": None,
        "meta": {
            "total":     result.total,
            "page":      result.page,
            "page_size": result.page_size,
        },
    }


@router.post("")
async def create_incident(
    payload: IncidentCreate,
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_permission("manage_incidents")),
    _:       dict    = Depends(require_module("incident")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    inc = await incident_service.create_incident(
        db, tenant_id, payload, claims["email"]
    )
    return {"data": inc, "error": None, "meta": {}}


@router.patch("/{incident_id}")
async def update_incident(
    incident_id: str,
    payload: IncidentUpdate,
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_permission("manage_incidents")),
    _:       dict    = Depends(require_module("incident")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    inc = await incident_service.update_incident(
        db, tenant_id, incident_id, payload, claims["email"]
    )
    return {"data": inc, "error": None, "meta": {}}


@router.delete("/{incident_id}")
async def delete_incident(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_permission("manage_incidents")),
    _:       dict    = Depends(require_module("incident")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    await incident_service.delete_incident(
        db, tenant_id, incident_id, claims["email"]
    )
    return {
        "data": {"message": f"Incident {incident_id} moved to recycle bin"},
        "error": None,
        "meta": {},
    }


@router.post("/{incident_id}/ai/impact")
async def generate_impact(
    incident_id: str,
    payload: AIIncidentRequest,
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_permission("generate_ai")),
    _:       dict    = Depends(require_module("incident")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    result = await ai_incident_service.generate_impact(
        db, tenant_id, incident_id, payload.force
    )
    return {"data": result, "error": None, "meta": {}}


@router.post("/{incident_id}/ai/actions")
async def generate_actions(
    incident_id: str,
    payload: AIIncidentRequest,
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_permission("generate_ai")),
    _:       dict    = Depends(require_module("incident")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    result = await ai_incident_service.generate_actions(
        db, tenant_id, incident_id, payload.force
    )
    return {"data": result, "error": None, "meta": {}}


@router.post("/ai/suggest-category")
async def suggest_category(
    payload: AIIncidentSuggestRequest,
    db:      AsyncSession = Depends(get_db),
    claims:  dict         = Depends(require_permission("generate_ai")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    result = await ai_incident_service.suggest_category(db, tenant_id, payload.description)
    return {"data": result, "error": None, "meta": {}}


@router.post("/ai/suggest-severity")
async def suggest_severity(
    payload: AIIncidentSuggestRequest,
    db:      AsyncSession = Depends(get_db),
    claims:  dict         = Depends(require_permission("generate_ai")),
):
    tenant_id = UUID(claims["active_tenant_id"])
    result = await ai_incident_service.suggest_severity(db, tenant_id, payload.description)
    return {"data": result, "error": None, "meta": {}}