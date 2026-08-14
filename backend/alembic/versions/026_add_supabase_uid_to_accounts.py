from alembic import op

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.execute("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS supabase_uid TEXT UNIQUE")

def downgrade() -> None:
    op.execute("ALTER TABLE accounts DROP COLUMN IF EXISTS supabase_uid")