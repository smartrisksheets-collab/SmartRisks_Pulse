"""add perm_version to tenants

Revision ID: 025
Revises: 024
Create Date: 2026-08-11
"""
from alembic import op

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS perm_version INTEGER NOT NULL DEFAULT 1;"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS perm_version;")