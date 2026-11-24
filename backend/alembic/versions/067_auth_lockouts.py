"""auth lockouts and reviewer backfill

Revision ID: 067
Revises: 066
Create Date: 2026-11-24
"""

from app.db.migration_sql import run_sql_file

revision = '067'
down_revision = '066'
branch_labels = None
depends_on = None


def upgrade() -> None:
    run_sql_file('067_auth_lockouts.sql')


def downgrade() -> None:
    run_sql_file('067_auth_lockouts_down.sql')
