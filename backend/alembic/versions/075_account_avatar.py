"""profile photo on accounts

Revision ID: 075
Revises: 074
Create Date: 2026-11-27
"""

from app.db.migration_sql import run_sql_file

revision = '075'
down_revision = '074'
branch_labels = None
depends_on = None


def upgrade() -> None:
    run_sql_file('075_account_avatar.sql')


def downgrade() -> None:
    run_sql_file('075_account_avatar_down.sql')
