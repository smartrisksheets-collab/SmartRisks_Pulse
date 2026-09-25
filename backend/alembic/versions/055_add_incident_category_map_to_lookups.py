"""add incident_category_map to lookups

Revision ID: 055
Revises: 054
Create Date: 2026-09-23
"""
from alembic import op

revision = '055'
down_revision = '054'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE lookups ADD COLUMN IF NOT EXISTS incident_category_map JSONB NOT NULL DEFAULT '{}'::jsonb")


def downgrade() -> None:
    op.execute("ALTER TABLE lookups DROP COLUMN IF EXISTS incident_category_map")