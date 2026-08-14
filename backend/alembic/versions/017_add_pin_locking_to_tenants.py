"""add pin locking to tenants

Revision ID: 017
Revises: 016
Create Date: 2026-07-26
"""

from alembic import op

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE tenants ADD COLUMN pin_attempts INT NOT NULL DEFAULT 0;")
    op.execute("ALTER TABLE tenants ADD COLUMN pin_locked_until TIMESTAMPTZ;")


def downgrade() -> None:
    op.execute("ALTER TABLE tenants DROP COLUMN pin_attempts;")
    op.execute("ALTER TABLE tenants DROP COLUMN pin_locked_until;")
