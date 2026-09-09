"""add cascade to tenant foreign keys

Revision ID: 052
Revises: 051
Create Date: 2026-09-09
"""
from alembic import op

revision = '052'
down_revision = '051'
branch_labels = None
depends_on = None

def upgrade() -> None:
    for table, constraint in [
        ("workspace_members",  "workspace_members_tenant_id_fkey"),
        ("risks",              "risks_tenant_id_fkey"),
        ("incidents",          "incidents_tenant_id_fkey"),
        ("audit_logs",         "audit_logs_tenant_id_fkey"),
        ("activity_feed",      "activity_feed_tenant_id_fkey"),
        ("risk_history",       "risk_history_tenant_id_fkey"),
        ("recycle_bin",        "recycle_bin_tenant_id_fkey"),
        ("external_submissions","external_submissions_tenant_id_fkey"),
        ("snapshots_monthly",  "snapshots_monthly_tenant_id_fkey"),
        ("snapshots_daily",    "snapshots_daily_tenant_id_fkey"),
        ("lookups",            "lookups_tenant_id_fkey"),
        ("notification_prefs", "notification_prefs_tenant_id_fkey"),
    ]:
        op.execute(f"""
            ALTER TABLE {table}
              DROP CONSTRAINT {constraint},
              ADD CONSTRAINT {constraint}
                FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
        """)


def downgrade() -> None:
    for table, constraint in [
        ("workspace_members",  "workspace_members_tenant_id_fkey"),
        ("risks",              "risks_tenant_id_fkey"),
        ("incidents",          "incidents_tenant_id_fkey"),
        ("audit_logs",         "audit_logs_tenant_id_fkey"),
        ("activity_feed",      "activity_feed_tenant_id_fkey"),
        ("risk_history",       "risk_history_tenant_id_fkey"),
        ("recycle_bin",        "recycle_bin_tenant_id_fkey"),
        ("external_submissions","external_submissions_tenant_id_fkey"),
        ("snapshots_monthly",  "snapshots_monthly_tenant_id_fkey"),
        ("snapshots_daily",    "snapshots_daily_tenant_id_fkey"),
        ("lookups",            "lookups_tenant_id_fkey"),
        ("notification_prefs", "notification_prefs_tenant_id_fkey"),
    ]:
        op.execute(f"""
            ALTER TABLE {table}
              DROP CONSTRAINT {constraint},
              ADD CONSTRAINT {constraint}
                FOREIGN KEY (tenant_id) REFERENCES tenants(id);
        """)