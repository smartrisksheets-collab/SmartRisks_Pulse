"""health_score and pressure_score on snapshots_monthly

Revision ID: 062
Revises: 061
Create Date: 2026-11-13
"""

from alembic import op

revision = '062'
down_revision = '061'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE snapshots_monthly ADD COLUMN IF NOT EXISTS health_score INTEGER")
    op.execute("ALTER TABLE snapshots_monthly ADD COLUMN IF NOT EXISTS pressure_score INTEGER")


def downgrade() -> None:
    op.execute("ALTER TABLE snapshots_monthly DROP COLUMN IF EXISTS pressure_score")
    op.execute("ALTER TABLE snapshots_monthly DROP COLUMN IF EXISTS health_score")
