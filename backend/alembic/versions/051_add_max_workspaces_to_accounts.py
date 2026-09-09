"""add max_workspaces to accounts

Revision ID: 051
Revises: 050
Create Date: 2026-09-08
"""
from alembic import op

revision = '051'
down_revision = '050'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.execute("""
        ALTER TABLE accounts
        ADD COLUMN max_workspaces INTEGER NOT NULL DEFAULT 1;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE accounts DROP COLUMN max_workspaces;")