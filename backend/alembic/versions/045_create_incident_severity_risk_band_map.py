"""create incident severity risk band map

Revision ID: 045
Revises: 044        
Create Date: 2026-09-04
"""
from alembic import op

revision = '045'
down_revision = '044'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE incident_severity_risk_band_map (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            severity_id UUID NOT NULL REFERENCES incident_severity_levels(id) ON DELETE CASCADE,
            risk_band_label TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    op.execute(
        "CREATE INDEX idx_incident_severity_risk_band_map_severity_id "
        "ON incident_severity_risk_band_map(severity_id);"
    )

def downgrade():
    op.execute("DROP TABLE IF EXISTS incident_severity_risk_band_map;")