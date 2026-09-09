"""create api error log table

Revision ID: 048
Revises: 047
Create Date: 2026-09-07
"""
from alembic import op

revision = '048'
down_revision = '047'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE api_error_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            status_code INT NOT NULL,
            error_detail TEXT,
            request_body JSONB,
            duration_ms INT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    op.execute(
        "CREATE INDEX idx_api_error_log_status_code ON api_error_log(status_code);"
    )
    op.execute(
        "CREATE INDEX idx_api_error_log_created_at ON api_error_log(created_at DESC);"
    )
    op.execute(
        "CREATE INDEX idx_api_error_log_tenant_id ON api_error_log(tenant_id);"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS api_error_log;")