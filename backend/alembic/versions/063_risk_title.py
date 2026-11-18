"""title on risks

Revision ID: 063
Revises: 062
Create Date: 2026-11-13
"""

from app.db.migration_sql import run_sql_file

revision = '063'
down_revision = '062'
branch_labels = None
depends_on = None


def upgrade() -> None:
    run_sql_file('063_risk_title.sql')


def downgrade() -> None:
    run_sql_file('063_risk_title_down.sql')
