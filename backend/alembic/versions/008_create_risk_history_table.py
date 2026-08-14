"""create risk_history table

Revision ID: 008
Revises: 007
Create Date: 2026-07-26
"""

from alembic import op

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE risk_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id),
            risk_id TEXT,
            residual_score NUMERIC,
            changed_by TEXT,
            recorded_at TIMESTAMPTZ DEFAULT now()
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS risk_history;")
