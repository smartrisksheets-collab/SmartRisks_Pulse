"""add business_unit array to lookups

Revision ID: 019
Revises: 018
Create Date: 2026-07-31
"""

from alembic import op

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE lookups ADD COLUMN business_unit TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];")


def downgrade() -> None:
    op.execute("ALTER TABLE lookups DROP COLUMN business_unit;")