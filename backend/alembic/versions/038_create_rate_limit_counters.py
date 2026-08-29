"""create rate_limit_counters table

Revision ID: 038
Revises: 037
Create Date: 2026-08-28
"""
from alembic import op

revision = '038'
down_revision = '037'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE rate_limit_counters (
            key          VARCHAR PRIMARY KEY,
            window_start TIMESTAMPTZ NOT NULL,
            count        INTEGER NOT NULL DEFAULT 0,
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS rate_limit_counters")