"""add trial_ends_at to tenants

Revision ID: 054
Revises: 053
Create Date: 2026-09-23
"""
from alembic import op

revision = '054'
down_revision = '053'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at DATE")
    op.execute("UPDATE tenants SET trial_ends_at = trial_start_date + 14 WHERE trial_ends_at IS NULL")
    op.execute("ALTER TABLE tenants ALTER COLUMN trial_ends_at SET DEFAULT (CURRENT_DATE + 14)")
    op.execute("ALTER TABLE tenants ALTER COLUMN trial_ends_at SET NOT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS trial_ends_at")