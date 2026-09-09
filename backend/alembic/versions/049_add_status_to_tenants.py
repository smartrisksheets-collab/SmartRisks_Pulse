"""add status to tenants

Revision ID: 049
Revises: 048
Create Date: 2026-09-08
"""
from alembic import op

revision = '049'
down_revision = '048'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS "
        "status TEXT NOT NULL DEFAULT 'ACTIVE';"
    )


def downgrade() -> None:
    op.execute("DROP COLUMN IF EXISTS status FROM tenants;")