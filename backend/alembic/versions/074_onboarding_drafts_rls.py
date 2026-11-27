"""onboarding drafts row level security

Revision ID: 074
Revises: 073
Create Date: 2026-11-27
"""

from app.db.migration_sql import run_sql_file

revision = '074'
down_revision = '073'
branch_labels = None
depends_on = None


def upgrade() -> None:
    run_sql_file('074_onboarding_drafts_rls.sql')


def downgrade() -> None:
    run_sql_file('074_onboarding_drafts_rls_down.sql')
