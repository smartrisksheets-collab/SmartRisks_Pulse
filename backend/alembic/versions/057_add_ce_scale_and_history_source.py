"""ce_scale and ce_labels on workspace_matrix_config, source on risk_history

Revision ID: 057
Revises: 056
Create Date: 2026-10-02
"""

from alembic import op

revision = '057'
down_revision = '056'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE workspace_matrix_config ADD COLUMN IF NOT EXISTS ce_scale INT NOT NULL DEFAULT 5")
    op.execute("ALTER TABLE workspace_matrix_config ADD CONSTRAINT chk_matrix_ce_scale CHECK (ce_scale IN (4, 5))")
    op.execute(
        "ALTER TABLE workspace_matrix_config ADD COLUMN IF NOT EXISTS ce_labels JSONB NOT NULL "
        "DEFAULT '{\"0\":\"No effective control\",\"1\":\"Weak\",\"2\":\"Limited\","
        "\"3\":\"Moderate\",\"4\":\"Strong\",\"5\":\"Very strong\"}'::jsonb"
    )
    op.execute("ALTER TABLE risk_history ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user'")
    op.execute(
        "ALTER TABLE risk_history ADD CONSTRAINT chk_risk_history_source "
        "CHECK (source IN ('user', 'scale_switch', 'import', 'restore'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE risk_history DROP CONSTRAINT IF EXISTS chk_risk_history_source")
    op.execute("ALTER TABLE risk_history DROP COLUMN IF EXISTS source")
    op.execute("ALTER TABLE workspace_matrix_config DROP COLUMN IF EXISTS ce_labels")
    op.execute("ALTER TABLE workspace_matrix_config DROP CONSTRAINT IF EXISTS chk_matrix_ce_scale")
    op.execute("ALTER TABLE workspace_matrix_config DROP COLUMN IF EXISTS ce_scale")