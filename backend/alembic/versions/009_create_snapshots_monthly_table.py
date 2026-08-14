"""create snapshots_monthly table

Revision ID: 009
Revises: 008
Create Date: 2026-07-26
"""

from alembic import op

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE snapshots_monthly (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id),
            month_key TEXT NOT NULL,
            month_label TEXT,
            month_date DATE,
            avg_residual NUMERIC,
            high_risk_count INT,
            total_risks INT,
            control_effectiveness NUMERIC,
            open_incidents INT,
            avg_mttr NUMERIC,
            financial_impact NUMERIC,
            created_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE(tenant_id, month_key)
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS snapshots_monthly;")
