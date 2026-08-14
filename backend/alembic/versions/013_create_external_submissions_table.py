"""create external_submissions table

Revision ID: 013
Revises: 012
Create Date: 2026-07-26
"""

from alembic import op

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE external_submissions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID NOT NULL REFERENCES tenants(id),
            submission_type TEXT NOT NULL,
            payload JSONB NOT NULL,
            submitter_email TEXT,
            status TEXT NOT NULL DEFAULT 'PENDING',
            reviewed_by TEXT,
            return_message TEXT,
            reviewed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now()
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS external_submissions;")
