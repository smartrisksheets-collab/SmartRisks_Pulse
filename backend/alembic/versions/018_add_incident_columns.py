"""add missing columns to incidents

Revision ID: 018
Revises: 017
Create Date: 2026-07-31
"""

from alembic import op

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE incidents ADD COLUMN reporter_email TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN channel TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN incident_type TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN incident_dt TIMESTAMPTZ;")
    op.execute("ALTER TABLE incidents ADD COLUMN location TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN impact_summary TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN affected_asset TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN business_unit TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN linked_risk_id TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN immediate_actions TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN evidence_link TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN analyst_notes TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN containment_date DATE;")
    op.execute("ALTER TABLE incidents ADD COLUMN tags TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN review_status TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN risk_impacted TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN resolution_summary TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN ai_status TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN ai_last_generated TIMESTAMPTZ;")


def downgrade() -> None:
    op.execute("ALTER TABLE incidents DROP COLUMN reporter_email;")
    op.execute("ALTER TABLE incidents DROP COLUMN channel;")
    op.execute("ALTER TABLE incidents DROP COLUMN incident_type;")
    op.execute("ALTER TABLE incidents DROP COLUMN incident_dt;")
    op.execute("ALTER TABLE incidents DROP COLUMN location;")
    op.execute("ALTER TABLE incidents DROP COLUMN impact_summary;")
    op.execute("ALTER TABLE incidents DROP COLUMN affected_asset;")
    op.execute("ALTER TABLE incidents DROP COLUMN business_unit;")
    op.execute("ALTER TABLE incidents DROP COLUMN linked_risk_id;")
    op.execute("ALTER TABLE incidents DROP COLUMN immediate_actions;")
    op.execute("ALTER TABLE incidents DROP COLUMN evidence_link;")
    op.execute("ALTER TABLE incidents DROP COLUMN analyst_notes;")
    op.execute("ALTER TABLE incidents DROP COLUMN containment_date;")
    op.execute("ALTER TABLE incidents DROP COLUMN tags;")
    op.execute("ALTER TABLE incidents DROP COLUMN review_status;")
    op.execute("ALTER TABLE incidents DROP COLUMN risk_impacted;")
    op.execute("ALTER TABLE incidents DROP COLUMN resolution_summary;")
    op.execute("ALTER TABLE incidents DROP COLUMN ai_status;")
    op.execute("ALTER TABLE incidents DROP COLUMN ai_last_generated;")