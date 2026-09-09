"""create incident severity levels

Revision ID: 042
Revises: 041        
Create Date: 2026-09-04
"""
from alembic import op

revision = '042'
down_revision = '041'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE incident_severity_levels (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            label TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            color TEXT NOT NULL DEFAULT '#64748b',
            criteria_text TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    op.execute(
        "CREATE INDEX idx_incident_severity_levels_tenant_id "
        "ON incident_severity_levels(tenant_id);"
    )

def downgrade():
    op.execute("DROP TABLE IF EXISTS incident_severity_levels;")