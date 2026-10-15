"""unified modules for all tenants"""
from alembic import op

revision = "059"
down_revision = "058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE tenants SET modules = ARRAY['risk','incident']::text[] "
        "WHERE NOT (modules @> ARRAY['risk','incident']::text[])"
    )
    op.execute("ALTER TABLE tenants ALTER COLUMN modules SET DEFAULT ARRAY['risk','incident']::text[]")


def downgrade() -> None:
    op.execute("ALTER TABLE tenants ALTER COLUMN modules SET DEFAULT ARRAY['risk']::text[]")