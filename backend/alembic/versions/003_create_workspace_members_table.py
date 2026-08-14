"""create workspace_members table

Revision ID: 003
Revises: 002
Create Date: 2026-07-26
"""

from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE workspace_members (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            account_id UUID NOT NULL REFERENCES accounts(id),
            tenant_id UUID NOT NULL REFERENCES tenants(id),
            role TEXT NOT NULL DEFAULT 'Analyst',
            permissions JSONB,
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            invited_by TEXT,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE(account_id, tenant_id)
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS workspace_members;")
