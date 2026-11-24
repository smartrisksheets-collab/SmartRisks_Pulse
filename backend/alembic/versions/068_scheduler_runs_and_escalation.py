"""scheduler run claims and incident escalated_at

Revision ID: 068
Revises: 067
Create Date: 2026-11-24
"""

from app.db.migration_sql import run_sql_file

revision = '068'
down_revision = '067'
branch_labels = None
depends_on = None


def upgrade() -> None:
    run_sql_file('068_scheduler_runs_and_escalation.sql')


def downgrade() -> None:
    run_sql_file('068_scheduler_runs_and_escalation_down.sql')
