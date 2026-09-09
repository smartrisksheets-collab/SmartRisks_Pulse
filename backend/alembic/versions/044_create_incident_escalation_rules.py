"""create incident escalation rules

Revision ID: 044
Revises: 043        
Create Date: 2026-09-04
"""
from alembic import op

revision = '044'
down_revision = '043'
branch_labels = None
depends_on = None



def upgrade():
    op.execute("""
        CREATE TABLE incident_escalation_rules (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            auto_escalate_on_breach BOOLEAN NOT NULL DEFAULT false,
            escalate_to TEXT NOT NULL DEFAULT 'admin',
            flag_unowned_after_hours INTEGER,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(tenant_id)
        );
    """)
    op.execute(
        "CREATE INDEX idx_incident_escalation_rules_tenant_id "
        "ON incident_escalation_rules(tenant_id);"
    )

def downgrade():
    op.execute("DROP TABLE IF EXISTS incident_escalation_rules;")