"""single-use refresh tokens

Revision ID: 070
Revises: 069
Create Date: 2026-11-24
"""

from app.db.migration_sql import run_sql_file

revision = '070'
down_revision = '069'
branch_labels = None
depends_on = None


def upgrade() -> None:
    run_sql_file('070_refresh_token_revocation.sql')


def downgrade() -> None:
    run_sql_file('070_refresh_token_revocation_down.sql')
