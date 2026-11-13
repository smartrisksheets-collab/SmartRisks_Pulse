"""incident stage line

Revision ID: 064
Revises: 063
Create Date: 2026-11-13
"""

from app.db.migration_sql import run_sql_file

revision = '064'
down_revision = '063'
branch_labels = None
depends_on = None


def upgrade() -> None:
    run_sql_file('064_incident_stages.sql')


def downgrade() -> None:
    run_sql_file('064_incident_stages_down.sql')
