"""create submission_tokens table

Revision ID: 035
Revises: 034
Create Date: 2026-08-28
"""
from alembic import op

revision = '035'
down_revision = '034'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE submission_tokens (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id    UUID NOT NULL,
            token           VARCHAR NOT NULL,
            label           VARCHAR NOT NULL,
            department      VARCHAR NOT NULL,
            issued_by       UUID NOT NULL,
            issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            expires_at      TIMESTAMPTZ,
            revoked_at      TIMESTAMPTZ,
            submission_count INTEGER NOT NULL DEFAULT 0
        )
    """)
    op.execute("ALTER TABLE submission_tokens ADD CONSTRAINT uq_submission_tokens_token UNIQUE (token)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS submission_tokens")