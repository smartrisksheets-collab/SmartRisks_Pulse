"""control_strength_pct on snapshots_monthly

Revision ID: 058
Revises: 057
Create Date: 2026-10-02
"""

from alembic import op

revision = '058'
down_revision = '057'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE snapshots_monthly ADD COLUMN IF NOT EXISTS control_strength_pct NUMERIC")


def downgrade() -> None:
    op.execute("ALTER TABLE snapshots_monthly DROP COLUMN IF EXISTS control_strength_pct")