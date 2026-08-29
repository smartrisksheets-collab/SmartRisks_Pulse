"""fix promoted_risk_id type on risk_submissions

Revision ID: 040
Revises: 039
Create Date: 2026-08-29
"""
from alembic import op

revision = '040'
down_revision = '039'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE risk_submissions "
        "ALTER COLUMN promoted_risk_id TYPE VARCHAR "
        "USING promoted_risk_id::TEXT"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE risk_submissions "
        "ALTER COLUMN promoted_risk_id TYPE UUID "
        "USING promoted_risk_id::UUID"
    )