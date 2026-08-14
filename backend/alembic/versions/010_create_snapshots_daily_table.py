"""create snapshots_daily table

Revision ID: 010
Revises: 009
Create Date: 2026-07-26
"""

from alembic import op

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE snapshots_daily (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id),
            date_key TEXT NOT NULL,
            snapshot_data JSONB,
            created_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE(tenant_id, date_key)
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS snapshots_daily;")
