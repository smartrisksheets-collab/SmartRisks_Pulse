"""band_5_extreme

Revision ID: 024
Revises: 023
Create Date: 2026-08-08`
"""

from alembic import op

revision = '024'
down_revision = '023'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE workspace_matrix_config ADD COLUMN IF NOT EXISTS band_extreme_min INT NOT NULL DEFAULT 21")
    op.execute("ALTER TABLE workspace_matrix_config ADD COLUMN IF NOT EXISTS band_extreme_max INT NOT NULL DEFAULT 25")
    op.execute("ALTER TABLE workspace_matrix_config ADD COLUMN IF NOT EXISTS band_5_label TEXT NOT NULL DEFAULT 'Extreme'")


def downgrade() -> None:
    op.execute("ALTER TABLE workspace_matrix_config DROP COLUMN IF EXISTS band_5_label")
    op.execute("ALTER TABLE workspace_matrix_config DROP COLUMN IF EXISTS band_extreme_max")
    op.execute("ALTER TABLE workspace_matrix_config DROP COLUMN IF EXISTS band_extreme_min")