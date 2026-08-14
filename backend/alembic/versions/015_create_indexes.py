"""create all indexes

Revision ID: 015
Revises: 014
Create Date: 2026-07-26
"""

from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE INDEX idx_risks_tenant_id ON risks(tenant_id);")
    op.execute("CREATE INDEX idx_incidents_tenant_id ON incidents(tenant_id);")
    op.execute("CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);")
    op.execute("CREATE INDEX idx_activity_feed_tenant_id ON activity_feed(tenant_id);")
    op.execute("CREATE INDEX idx_risk_history_tenant_id ON risk_history(tenant_id);")
    op.execute(
        "CREATE INDEX idx_snapshots_monthly_tenant_id ON snapshots_monthly(tenant_id);"
    )
    op.execute("CREATE INDEX idx_recycle_bin_tenant_id ON recycle_bin(tenant_id);")
    op.execute(
        "CREATE INDEX idx_workspace_members_account_id ON workspace_members(account_id);"
    )
    op.execute(
        "CREATE INDEX idx_workspace_members_tenant_id ON workspace_members(tenant_id);"
    )
    op.execute("CREATE INDEX idx_risks_level ON risks(tenant_id, level);")
    op.execute("CREATE INDEX idx_risks_owner ON risks(tenant_id, owner_email);")
    op.execute(
        "CREATE INDEX idx_risks_mitigation_status ON risks(tenant_id, mitigation_status);"
    )
    op.execute("CREATE INDEX idx_incidents_status ON incidents(tenant_id, status);")
    op.execute("CREATE INDEX idx_incidents_severity ON incidents(tenant_id, severity);")
    op.execute(
        "CREATE INDEX idx_audit_logs_created_at ON audit_logs(tenant_id, created_at DESC);"
    )
    op.execute(
        "CREATE INDEX idx_activity_feed_created_at ON activity_feed(tenant_id, created_at DESC);"
    )
    op.execute("CREATE INDEX idx_recycle_bin_purge_at ON recycle_bin(purge_at);")
    op.execute(
        "CREATE INDEX idx_snapshots_month ON snapshots_monthly(tenant_id, month_date DESC);"
    )
    op.execute("CREATE INDEX idx_tenants_plan_expires_at ON tenants(plan_expires_at);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_risks_tenant_id;")
    op.execute("DROP INDEX IF EXISTS idx_incidents_tenant_id;")
    op.execute("DROP INDEX IF EXISTS idx_audit_logs_tenant_id;")
    op.execute("DROP INDEX IF EXISTS idx_activity_feed_tenant_id;")
    op.execute("DROP INDEX IF EXISTS idx_risk_history_tenant_id;")
    op.execute("DROP INDEX IF EXISTS idx_snapshots_monthly_tenant_id;")
    op.execute("DROP INDEX IF EXISTS idx_recycle_bin_tenant_id;")
    op.execute("DROP INDEX IF EXISTS idx_workspace_members_account_id;")
    op.execute("DROP INDEX IF EXISTS idx_workspace_members_tenant_id;")
    op.execute("DROP INDEX IF EXISTS idx_risks_level;")
    op.execute("DROP INDEX IF EXISTS idx_risks_owner;")
    op.execute("DROP INDEX IF EXISTS idx_risks_mitigation_status;")
    op.execute("DROP INDEX IF EXISTS idx_incidents_status;")
    op.execute("DROP INDEX IF EXISTS idx_incidents_severity;")
    op.execute("DROP INDEX IF EXISTS idx_audit_logs_created_at;")
    op.execute("DROP INDEX IF EXISTS idx_activity_feed_created_at;")
    op.execute("DROP INDEX IF EXISTS idx_recycle_bin_purge_at;")
    op.execute("DROP INDEX IF EXISTS idx_snapshots_month;")
    op.execute("DROP INDEX IF EXISTS idx_tenants_plan_expires_at;")
