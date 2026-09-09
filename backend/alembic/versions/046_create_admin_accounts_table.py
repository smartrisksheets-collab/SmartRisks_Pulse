"""create admin accounts table

Revision ID: 046
Revises: 045
Create Date: 2026-09-07
"""
from alembic import op

revision = '046'
down_revision = '045'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE admin_accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'admin',
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            last_login TIMESTAMPTZ,
            created_by UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    op.execute(
        "CREATE INDEX idx_admin_accounts_email ON admin_accounts(email);"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS admin_accounts;")