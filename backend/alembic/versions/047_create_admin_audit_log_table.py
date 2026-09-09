"""create admin audit log table

Revision ID: 047
Revises: 046
Create Date: 2026-09-07
"""
from alembic import op

revision = '047'
down_revision = '046'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE admin_audit_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            admin_id UUID NOT NULL REFERENCES admin_accounts(id) ON DELETE SET NULL,
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            meta JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    op.execute(
        "CREATE INDEX idx_admin_audit_log_admin_id ON admin_audit_log(admin_id);"
    )
    op.execute(
        "CREATE INDEX idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS admin_audit_log;")