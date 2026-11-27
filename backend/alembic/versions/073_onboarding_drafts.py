"""onboarding drafts

Revision ID: 073
Revises: 072
Create Date: 2026-11-27
"""

from app.db.migration_sql import run_sql_file

revision = '073'
down_revision = '072'
branch_labels = None
depends_on = None


def upgrade() -> None:
    run_sql_file('073_onboarding_drafts.sql')


def downgrade() -> None:
    run_sql_file('073_onboarding_drafts_down.sql')
