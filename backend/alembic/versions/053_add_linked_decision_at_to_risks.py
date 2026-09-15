"""add linked_decision_at to risks

Revision ID: 053
Revises: 052
"""
from alembic import op

revision = "053"
down_revision = "052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE risks ADD COLUMN IF NOT EXISTS linked_decision_at DATE;"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE risks DROP COLUMN IF EXISTS linked_decision_at;"
    )