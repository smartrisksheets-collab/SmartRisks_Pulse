"""create report tables

Revision ID: 020
Revises: 019
Create Date: 2026-08-03
"""
from alembic import op

revision = '020'
down_revision = '019'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE report_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            description VARCHAR(1000),
            report_type VARCHAR(100),
            blocks JSONB NOT NULL DEFAULT '[]',
            settings JSONB NOT NULL DEFAULT '{}',
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            created_by VARCHAR(255),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE INDEX ix_report_templates_tenant_id ON report_templates(tenant_id)
    """)

    op.execute("""
        CREATE TABLE report_settings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
            settings JSONB NOT NULL DEFAULT '{}',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE INDEX ix_report_settings_tenant_id ON report_settings(tenant_id)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS report_settings")
    op.execute("DROP TABLE IF EXISTS report_templates")