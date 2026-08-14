"""add token_version to accounts

Revision ID: 016
Revises: 015
Create Date: 2026-07-26
"""

from alembic import op

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE accounts ADD COLUMN token_version INT NOT NULL DEFAULT 1;")


def downgrade() -> None:
    op.execute("ALTER TABLE accounts DROP COLUMN token_version;")
