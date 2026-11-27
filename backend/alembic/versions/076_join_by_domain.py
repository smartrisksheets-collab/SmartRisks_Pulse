"""join by email domain

Revision ID: 076
Revises: 075
Create Date: 2026-11-27
"""

from app.db.migration_sql import run_sql_file

revision = '076'
down_revision = '075'
branch_labels = None
depends_on = None


def upgrade() -> None:
    run_sql_file('076_join_by_domain.sql')


def downgrade() -> None:
    run_sql_file('076_join_by_domain_down.sql')
