# alembic/versions/033_add_control_assertion_source.py

from alembic import op

revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None

def upgrade():
    op.execute("ALTER TABLE risks ADD COLUMN IF NOT EXISTS control_assertion_source TEXT;")

def downgrade():
    op.execute("ALTER TABLE risks DROP COLUMN IF EXISTS control_assertion_source;")