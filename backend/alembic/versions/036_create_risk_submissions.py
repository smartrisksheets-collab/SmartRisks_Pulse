"""create risk_submissions table

Revision ID: 036
Revises: 035
Create Date: 2026-08-28
"""
from alembic import op

revision = '036'
down_revision = '035'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE risk_submissions (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id        UUID NOT NULL,
            token_id            UUID NOT NULL,
            reference           VARCHAR NOT NULL,
            submitter_name      VARCHAR NOT NULL,
            submitter_email     VARCHAR NOT NULL,
            department          VARCHAR NOT NULL,
            submission_type     VARCHAR NOT NULL DEFAULT 'risk',
            description         TEXT NOT NULL,
            cause               TEXT,
            affects             TEXT,
            suggested_category  VARCHAR,
            existing_controls   TEXT,
            suggested_action    TEXT,
            submitter_urgency   VARCHAR,
            attachment_url      VARCHAR,
            status              VARCHAR NOT NULL DEFAULT 'pending',
            triaged_by          UUID,
            triaged_at          TIMESTAMPTZ,
            triage_note         TEXT,
            promoted_risk_id    UUID,
            submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            submitter_ip        VARCHAR
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS risk_submissions")