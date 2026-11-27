"""drop workspace-level PIN lock columns

Revision ID: 071
Revises: 070
Create Date: 2026-11-25
"""

from app.db.migration_sql import run_sql_file

revision = '071'
down_revision = '070'
branch_labels = None
depends_on = None


def upgrade() -> None:
    run_sql_file('071_drop_tenant_pin_lock_columns.sql')


def downgrade() -> None:
    run_sql_file('071_drop_tenant_pin_lock_columns_down.sql')
