from alembic import op

revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS org_size VARCHAR")
    op.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS framework VARCHAR")
    op.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS timezone VARCHAR")
    op.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS date_format VARCHAR")


def downgrade() -> None:
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS org_size")
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS framework")
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS timezone")
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS date_format")