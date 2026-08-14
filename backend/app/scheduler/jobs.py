# app/scheduler/jobs.py
# APScheduler job definitions.
# All jobs create their own DB sessions via AsyncSessionLocal (no request context).
# Source schedule mappings from SMARTRISK_V2_SETUP.md job table.

from __future__ import annotations

import logging
from datetime import datetime, timezone, date

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)


# ── helpers ────────────────────────────────────────────────────────────────

async def _get_all_tenant_ids() -> list:
    """Fetch all tenant UUIDs in a short-lived session."""
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(Tenant.id))).scalars().all()
    return list(rows)


# ── job: daily per-risk snapshot ───────────────────────────────────────────

async def job_daily_snapshot() -> None:
    """
    Capture per-risk state for all tenants into snapshots_daily.
    Runs at 00:00 UTC daily.
    Source: SnapshotService.gs runDailySnapshot trigger chain.
    """
    from app.services.snapshot import write_daily_snapshot

    tenant_ids = await _get_all_tenant_ids()
    for tid in tenant_ids:
        try:
            async with AsyncSessionLocal() as db:
                async with db.begin():
                    await write_daily_snapshot(db, tid)
        except Exception:
            logger.exception("job_daily_snapshot failed for tenant=%s", tid)


# ── job: monthly aggregate snapshot ───────────────────────────────────────

async def job_monthly_snapshot() -> None:
    """
    Write monthly aggregate snapshot for all tenants.
    Runs at 00:05 UTC on the 1st of each month.
    Source: SnapshotService.gs runMonthlySnapshot.
    """
    from app.services.snapshot import write_monthly_snapshot

    tenant_ids = await _get_all_tenant_ids()
    for tid in tenant_ids:
        try:
            async with AsyncSessionLocal() as db:
                async with db.begin():
                    await write_monthly_snapshot(db, tid)
        except Exception:
            logger.exception("job_monthly_snapshot failed for tenant=%s", tid)


# ── job: recycle bin purge ────────────────────────────────────────────────

async def job_recycle_purge() -> None:
    """
    Permanently delete recycle bin entries past their purge_at date.
    Runs at 02:00 UTC daily.
    purge_expired operates across all tenants in one pass.
    Source: SMARTRISK_V2_SETUP.md daily purge job.
    """
    from app.services.recycle import purge_expired

    try:
        async with AsyncSessionLocal() as db:
            async with db.begin():
                await purge_expired(db)
    except Exception:
        logger.exception("job_recycle_purge failed")


# ── job: daily freshness update ────────────────────────────────────────────

async def job_freshness_update() -> None:
    """
    Recompute freshness labels for all non-deleted risks.
    Runs at 06:00 UTC daily.
    Source: PhaseOne.gs api_dailyFreshnessJob.
    """
    from app.models.risk import Risk as RiskModel
    from app.services.phase_one import compute_freshness

    tenant_ids = await _get_all_tenant_ids()
    for tid in tenant_ids:
        try:
            async with AsyncSessionLocal() as db:
                async with db.begin():
                    risks = (
                        await db.execute(
                            select(RiskModel).where(
                                RiskModel.tenant_id == tid,
                                RiskModel.deleted_at.is_(None),
                            )
                        )
                    ).scalars().all()
                    for risk in risks:
                        fresh = compute_freshness(
                            risk.last_reviewed_at,  # type: ignore[arg-type]
                            risk.logged_at,         # type: ignore[arg-type]
                        )
                        risk.freshness = fresh  # type: ignore[assignment]
                    await db.flush()
        except Exception:
            logger.exception("job_freshness_update failed for tenant=%s", tid)


# ── job: morning brief dispatch ────────────────────────────────────────────

async def job_brief_send() -> None:
    """
    Send the daily brief for all tenants whose configured brief_send_time
    matches the current UTC hour. Runs every hour 07:00–10:00 UTC.

    Duplicate send guard: if brief_last_sent == today, skip that tenant.
    Weekend guard: skips Saturday and Sunday.
    Source: BriefEmailService.gs runBriefSend + _sendBriefForWorkspace_.
    """
    from app.services.brief import build_brief_payload
    from app.services.email import build_brief_html, build_brief_subject, send_brief_email

    now       = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    dow       = now.weekday()  # 0=Mon, 5=Sat, 6=Sun

    if dow >= 5:
        logger.info("job_brief_send: weekend — skipped")
        return

    current_hour = now.hour

    async with AsyncSessionLocal() as db:
        tenants = (await db.execute(select(Tenant))).scalars().all()

    for tenant in tenants:
        ws: dict = dict(tenant.workspace_settings or {})  # type: ignore[arg-type]

        if ws.get("brief_enabled", "off") != "on":
            continue

        recipients = str(ws.get("brief_recipients") or "").strip()
        if not recipients:
            continue

        # Duplicate send guard
        if str(ws.get("brief_last_sent") or "") == today_str:
            continue

        # Hour match
        send_time   = str(ws.get("brief_send_time") or "08:00")
        config_hour = int(send_time.split(":")[0])
        if current_hour != config_hour:
            continue

        recipient_list = [e.strip() for e in recipients.split(",") if e.strip()]
        if not recipient_list:
            continue

        primary = recipient_list[0]
        bcc     = recipient_list[1:]

        try:
            async with AsyncSessionLocal() as db:
                async with db.begin():
                    payload = await build_brief_payload(db, tenant.id, primary)  # type: ignore[union-attr]

                    if not payload.ok or payload.skip:
                        logger.info("job_brief_send: skipped tenant=%s reason=%s", tenant.id, payload.reason)
                        continue

                    html    = build_brief_html(payload)
                    subject = build_brief_subject(payload)

                    try:
                        await send_brief_email(primary, bcc, subject, html)
                    except Exception as email_exc:
                        logger.warning("job_brief_send email failed for tenant=%s: %s", tenant.id, email_exc)
                        continue

                    # Record send date
                    existing: dict = dict(tenant.workspace_settings or {})  # type: ignore[arg-type]
                    existing["brief_last_sent"] = today_str
                    tenant.workspace_settings = existing  # type: ignore[assignment]

                    logger.info("job_brief_send: sent for tenant=%s to=%d recipients", tenant.id, len(recipient_list))

        except Exception:
            logger.exception("job_brief_send failed for tenant=%s", tenant.id)