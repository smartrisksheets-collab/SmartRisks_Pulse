# app/api/v1/routes/incident_severity.py
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, require_module, require_permission
from app.core.rate_limit import limiter
from app.schemas.incident_severity import (
    EscalationRuleUpsert,
    SeverityLevelUpsert,
    SlaTargetUpsert,
)
from app.services import incident_severity as sev_service

router = APIRouter(prefix='/incident-severity', tags=['incident-severity'])


@router.get('/config')
async def get_config(
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_module('incident')),
):
    tenant_id = UUID(claims['active_tenant_id'])
    result = await sev_service.get_config(db, tenant_id)
    return {'data': result, 'error': None, 'meta': {}}


@router.put('/levels')
@limiter.limit('60/minute')
async def upsert_levels(
    request: Request,
    payload: list[SeverityLevelUpsert],
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_permission('manage_settings')),
    _: dict          = Depends(require_module('incident')),
):
    tenant_id = UUID(claims['active_tenant_id'])
    result = await sev_service.upsert_levels(db, tenant_id, payload)
    return {'data': result, 'error': None, 'meta': {}}


@router.delete('/levels/{level_id}')
@limiter.limit('60/minute')
async def delete_level(
    request: Request,
    level_id: UUID,
    reassign_to: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_permission('manage_settings')),
    _: dict          = Depends(require_module('incident')),
):
    tenant_id = UUID(claims['active_tenant_id'])
    await sev_service.delete_level(db, tenant_id, level_id, reassign_to)
    return {'data': {'message': 'Severity level deleted'}, 'error': None, 'meta': {}}


@router.put('/sla')
@limiter.limit('60/minute')
async def upsert_sla(
    request: Request,
    payload: list[SlaTargetUpsert],
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_permission('manage_settings')),
    _: dict          = Depends(require_module('incident')),
):
    tenant_id = UUID(claims['active_tenant_id'])
    result = await sev_service.upsert_sla(db, tenant_id, payload)
    return {'data': result, 'error': None, 'meta': {}}


@router.put('/escalation')
@limiter.limit('60/minute')
async def upsert_escalation(
    request: Request,
    payload: EscalationRuleUpsert,
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_permission('manage_settings')),
    _: dict          = Depends(require_module('incident')),
):
    tenant_id = UUID(claims['active_tenant_id'])
    result = await sev_service.upsert_escalation(db, tenant_id, payload)
    return {'data': result, 'error': None, 'meta': {}}


@router.get('/preview')
async def get_preview(
    db: AsyncSession = Depends(get_db),
    claims: dict     = Depends(require_module('incident')),
):
    tenant_id = UUID(claims['active_tenant_id'])
    result = await sev_service.get_preview(db, tenant_id)
    return {'data': result, 'error': None, 'meta': {}}