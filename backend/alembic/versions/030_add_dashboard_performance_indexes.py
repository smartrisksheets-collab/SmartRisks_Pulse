"""add dashboard performance indexes

Revision ID: 030
Revises: 029
Create Date: 2026-08-17
"""

from alembic import op

revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Partial indexes on risks WHERE deleted_at IS NULL.
    # All dashboard queries filter deleted_at IS NULL — a partial index only
    # contains active rows, so Postgres skips deleted rows at the index level
    # rather than filtering them in memory after the scan.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_risks_active "
        "ON risks(tenant_id) WHERE deleted_at IS NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_risks_category "
        "ON risks(tenant_id, category) WHERE deleted_at IS NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_risks_residual "
        "ON risks(tenant_id, residual DESC) WHERE deleted_at IS NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_risks_logged_at "
        "ON risks(tenant_id, logged_at) WHERE deleted_at IS NULL;"
    )

    # Partial indexes on incidents WHERE deleted_at IS NULL.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_incidents_active "
        "ON incidents(tenant_id) WHERE deleted_at IS NULL;"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_incidents_reported_at "
        "ON incidents(tenant_id, reported_at) WHERE deleted_at IS NULL;"
    )

    # Fix snapshot sort: existing idx_snapshots_month is on month_date but
    # get_snapshot_delta queries ORDER BY month_key DESC. Add the correct index.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_snapshots_month_key "
        "ON snapshots_monthly(tenant_id, month_key DESC);"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_risks_active;")
    op.execute("DROP INDEX IF EXISTS idx_risks_category;")
    op.execute("DROP INDEX IF EXISTS idx_risks_residual;")
    op.execute("DROP INDEX IF EXISTS idx_risks_logged_at;")
    op.execute("DROP INDEX IF EXISTS idx_incidents_active;")
    op.execute("DROP INDEX IF EXISTS idx_incidents_reported_at;")
    op.execute("DROP INDEX IF EXISTS idx_snapshots_month_key;")