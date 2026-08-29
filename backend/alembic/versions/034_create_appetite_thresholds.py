# alembic/versions/034_create_appetite_thresholds.py

from alembic import op

revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None

def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS appetite_thresholds (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id   UUID NOT NULL REFERENCES tenants(id),
            category    TEXT NOT NULL,
            threshold   INTEGER NOT NULL,
            rationale   TEXT,
            set_by      TEXT,
            set_at      TIMESTAMPTZ DEFAULT now(),
            updated_at  TIMESTAMPTZ DEFAULT now(),
            UNIQUE (tenant_id, category)
        );
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_appetite_thresholds_tenant_id "
        "ON appetite_thresholds(tenant_id);"
    )

def downgrade():
    op.execute("DROP TABLE IF EXISTS appetite_thresholds;")