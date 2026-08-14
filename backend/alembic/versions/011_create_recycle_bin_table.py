"""create recycle_bin table

Revision ID: 011
Revises: 010
Create Date: 2026-07-26
"""

from alembic import op

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE recycle_bin (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id),
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            item_data JSONB NOT NULL,
            deleted_by TEXT,
            purge_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now()
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS recycle_bin;")
