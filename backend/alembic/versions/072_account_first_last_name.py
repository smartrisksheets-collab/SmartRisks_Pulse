"""first and last name on accounts

Revision ID: 072
Revises: 071
Create Date: 2026-11-27
"""

from app.db.migration_sql import run_sql_file

revision = '072'
down_revision = '071'
branch_labels = None
depends_on = None


def upgrade() -> None:
    run_sql_file('072_account_first_last_name.sql')


def downgrade() -> None:
    run_sql_file('072_account_first_last_name_down.sql')
