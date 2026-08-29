# alembic/versions/032_add_risk_register_fields.py

from alembic import op

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None

def upgrade():
    op.execute("ALTER TABLE risks ADD COLUMN IF NOT EXISTS root_cause TEXT;")
    op.execute("ALTER TABLE risks ADD COLUMN IF NOT EXISTS financial_exposure TEXT;")
    op.execute("ALTER TABLE risks ADD COLUMN IF NOT EXISTS linked_decision TEXT;")

def downgrade():
    op.execute("ALTER TABLE risks DROP COLUMN IF EXISTS root_cause;")
    op.execute("ALTER TABLE risks DROP COLUMN IF EXISTS financial_exposure;")
    op.execute("ALTER TABLE risks DROP COLUMN IF EXISTS linked_decision;")