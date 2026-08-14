"""create notification_prefs table

Revision ID: 014
Revises: 013
Create Date: 2026-07-26
"""

from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE notification_prefs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id),
            user_email TEXT NOT NULL,
            brief_frequency TEXT DEFAULT 'daily',
            opted_out BOOLEAN DEFAULT false,
            updated_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE(tenant_id, user_email)
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS notification_prefs;")
