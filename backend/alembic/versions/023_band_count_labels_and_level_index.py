"""band_count_labels_and_level_index

Revision ID: 023
Revises: 022
Create Date: 2026-08-07
"""

from alembic import op

revision = '023'
down_revision = '022'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE workspace_matrix_config ADD COLUMN IF NOT EXISTS band_count INT NOT NULL DEFAULT 4")
    op.execute("ALTER TABLE workspace_matrix_config ADD COLUMN IF NOT EXISTS band_1_label TEXT NOT NULL DEFAULT 'Low'")
    op.execute("ALTER TABLE workspace_matrix_config ADD COLUMN IF NOT EXISTS band_2_label TEXT NOT NULL DEFAULT 'Medium'")
    op.execute("ALTER TABLE workspace_matrix_config ADD COLUMN IF NOT EXISTS band_3_label TEXT NOT NULL DEFAULT 'High'")
    op.execute("ALTER TABLE workspace_matrix_config ADD COLUMN IF NOT EXISTS band_4_label TEXT NOT NULL DEFAULT 'Critical'")
    op.execute("ALTER TABLE risks ADD COLUMN IF NOT EXISTS level_index INT")
    op.execute("ALTER TABLE risks ADD COLUMN IF NOT EXISTS is_elevated BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("""
        UPDATE risks SET level_index = CASE
            WHEN level = 'Critical' THEN 4
            WHEN level = 'High'     THEN 3
            WHEN level = 'Medium'   THEN 2
            ELSE 1
        END
        WHERE level_index IS NULL
    """)
    op.execute("UPDATE risks SET is_elevated = (level_index >= 3) WHERE TRUE")


def downgrade() -> None:
    op.execute("ALTER TABLE risks DROP COLUMN IF EXISTS is_elevated")
    op.execute("ALTER TABLE risks DROP COLUMN IF EXISTS level_index")
    op.execute("ALTER TABLE workspace_matrix_config DROP COLUMN IF EXISTS band_4_label")
    op.execute("ALTER TABLE workspace_matrix_config DROP COLUMN IF EXISTS band_3_label")
    op.execute("ALTER TABLE workspace_matrix_config DROP COLUMN IF EXISTS band_2_label")
    op.execute("ALTER TABLE workspace_matrix_config DROP COLUMN IF EXISTS band_1_label")
    op.execute("ALTER TABLE workspace_matrix_config DROP COLUMN IF EXISTS band_count")