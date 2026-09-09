"""Create payments table

Revision ID: 050
Revises: 049
Create Date: 2026-09-08
"""
from alembic import op

revision = '050'
down_revision = '049'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.execute("""
        CREATE TABLE payments (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            amount      NUMERIC(12, 2) NOT NULL,
            currency    VARCHAR(10) NOT NULL DEFAULT 'USD',
            method      VARCHAR(60),
            reference   VARCHAR(120),
            notes       TEXT,
            paid_at     DATE NOT NULL,
            recorded_by VARCHAR(120),
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX idx_payments_tenant_id ON payments(tenant_id);")
    op.execute("CREATE INDEX idx_payments_paid_at ON payments(paid_at DESC);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS payments;")