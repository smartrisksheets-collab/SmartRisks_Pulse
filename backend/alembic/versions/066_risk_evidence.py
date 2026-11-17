"""risk evidence document

Revision ID: 066
Revises: 065
Create Date: 2026-11-16
"""

from app.db.migration_sql import run_sql_file

revision = '066'
down_revision = '065'
branch_labels = None
depends_on = None


def upgrade() -> None:
    run_sql_file('066_risk_evidence.sql')


def downgrade() -> None:
    run_sql_file('066_risk_evidence_down.sql')
