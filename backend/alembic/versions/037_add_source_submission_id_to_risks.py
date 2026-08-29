"""add source_submission_id to risks

Revision ID: 037
Revises: 036
Create Date: 2026-08-28
"""
from alembic import op

revision = '037'
down_revision = '036'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE risks ADD COLUMN IF NOT EXISTS source_submission_id UUID"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE risks DROP COLUMN IF EXISTS source_submission_id")