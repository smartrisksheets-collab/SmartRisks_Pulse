"""id counters and submission indexes

Revision ID: 069
Revises: 068
Create Date: 2026-11-24
"""

from app.db.migration_sql import run_sql_file

revision = '069'
down_revision = '068'
branch_labels = None
depends_on = None


def upgrade() -> None:
    run_sql_file('069_id_counters.sql')


def downgrade() -> None:
    run_sql_file('069_id_counters_down.sql')
