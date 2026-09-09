
"""create incident sla targets

Revision ID: 043
Revises: 042        
Create Date: 2026-09-04
"""
from alembic import op

revision = '043'
down_revision = '042'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE incident_sla_targets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            severity_id UUID NOT NULL REFERENCES incident_severity_levels(id) ON DELETE CASCADE,
            target_value NUMERIC NOT NULL,
            target_unit TEXT NOT NULL DEFAULT 'hours',
            target_hours NUMERIC NOT NULL,
            notify_on_log TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    op.execute(
        "CREATE INDEX idx_incident_sla_targets_severity_id "
        "ON incident_sla_targets(severity_id);"
    )

def downgrade():
    op.execute("DROP TABLE IF EXISTS incident_sla_targets;")