"""create incidents table

Revision ID: 005
Revises: 004
Create Date: 2026-07-26
"""

from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE incidents (
            id TEXT NOT NULL,
            tenant_id UUID NOT NULL REFERENCES tenants(id),
            title TEXT,
            description TEXT,
            category TEXT,
            severity TEXT,
            priority TEXT,
            status TEXT DEFAULT 'Open',
            root_cause TEXT,
            assigned_to TEXT,
            reported_by TEXT,
            reported_at DATE,
            resolved_at TIMESTAMPTZ,
            financial_impact NUMERIC,
            ai_impact TEXT,
            ai_actions TEXT,
            deleted_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now(),
            PRIMARY KEY (id, tenant_id)
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS incidents;")
