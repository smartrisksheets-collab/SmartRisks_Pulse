"""create audit_logs table

Revision ID: 006
Revises: 005
Create Date: 2026-07-26
"""

from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE audit_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id),
            user_email TEXT,
            action TEXT,
            module TEXT,
            record_id TEXT,
            summary TEXT,
            created_at TIMESTAMPTZ DEFAULT now()
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS audit_logs;")
