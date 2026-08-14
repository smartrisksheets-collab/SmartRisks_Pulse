"""create workspace_presence table

Revision ID: 021
Revises: 020
"""
from alembic import op

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS workspace_presence (
            tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            email      TEXT NOT NULL,
            last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (tenant_id, account_id)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_presence_tenant_seen
            ON workspace_presence(tenant_id, last_seen)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS workspace_presence")