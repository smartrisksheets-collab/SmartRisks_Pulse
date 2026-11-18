"""report builder drafts

Revision ID: 065
Revises: 064
Create Date: 2026-11-14
"""

from app.db.migration_sql import run_sql_file

revision = '065'
down_revision = '064'
branch_labels = None
depends_on = None


def upgrade() -> None:
    run_sql_file('065_report_drafts.sql')


def downgrade() -> None:
    run_sql_file('065_report_drafts_down.sql')
