"""create risks table

Revision ID: 004
Revises: 003
Create Date: 2026-07-26
"""

from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE risks (
            id TEXT NOT NULL,
            tenant_id UUID NOT NULL REFERENCES tenants(id),
            category TEXT,
            description TEXT,
            primary_impact TEXT,
            owner TEXT,
            owner_email TEXT,
            logged_at DATE,
            likelihood INT,
            impact_score INT,
            severity NUMERIC,
            level TEXT,
            treatment TEXT,
            controls TEXT,
            control_effectiveness INT,
            residual NUMERIC,
            overall_rating NUMERIC,
            mitigation_plan TEXT,
            comments TEXT,
            ai_insight TEXT,
            score_delta NUMERIC DEFAULT 0,
            movement TEXT,
            freshness TEXT,
            target_date DATE,
            mitigation_status TEXT DEFAULT 'Open',
            last_reviewed_at TIMESTAMPTZ,
            control_last_tested DATE,
            control_test_result TEXT DEFAULT 'Not Tested',
            deleted_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now(),
            PRIMARY KEY (id, tenant_id)
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS risks;")
