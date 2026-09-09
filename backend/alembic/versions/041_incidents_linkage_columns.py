"""add incidents linkage columns

Revision ID: 041
Revises: 040        
Create Date: 2026-09-04
"""
from alembic import op

revision = '041'
down_revision = '040'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE incidents ADD COLUMN linked_control TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN control_outcome TEXT;")
    op.execute("ALTER TABLE incidents ADD COLUMN impact_confidence TEXT;")

def downgrade():
    op.execute("ALTER TABLE incidents DROP COLUMN IF EXISTS impact_confidence;")
    op.execute("ALTER TABLE incidents DROP COLUMN IF EXISTS control_outcome;")
    op.execute("ALTER TABLE incidents DROP COLUMN IF EXISTS linked_control;")