"""add source to risks

Revision ID: 028
Revises: 027
Create Date: 2026-08-14
"""
from alembic import op

revision = '028'
down_revision = '027'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE risks ADD COLUMN IF NOT EXISTS "
        "source VARCHAR NOT NULL DEFAULT 'internal'"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE risks DROP COLUMN IF EXISTS source")