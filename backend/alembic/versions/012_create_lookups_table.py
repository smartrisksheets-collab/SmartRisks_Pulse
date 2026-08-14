"""create lookups table

Revision ID: 012
Revises: 011
Create Date: 2026-07-26
"""

from alembic import op

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE lookups (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id),
            category TEXT[] DEFAULT ARRAY[]::TEXT[],
            treatment TEXT[] DEFAULT ARRAY[]::TEXT[],
            likelihood TEXT[] DEFAULT ARRAY[]::TEXT[],
            impact_level TEXT[] DEFAULT ARRAY[]::TEXT[],
            risk_owner TEXT[] DEFAULT ARRAY[]::TEXT[],
            incident_category TEXT[] DEFAULT ARRAY[]::TEXT[],
            incident_severity TEXT[] DEFAULT ARRAY[]::TEXT[],
            updated_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE(tenant_id)
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS lookups;")
