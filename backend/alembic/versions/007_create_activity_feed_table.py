"""create activity_feed table

Revision ID: 007
Revises: 006
Create Date: 2026-07-26
"""

from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE activity_feed (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id),
            risk_id TEXT,
            risk_title TEXT,
            action_type TEXT,
            old_value NUMERIC,
            new_value NUMERIC,
            user_email TEXT,
            category TEXT,
            level TEXT,
            label TEXT,
            created_at TIMESTAMPTZ DEFAULT now()
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS activity_feed;")
