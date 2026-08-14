"""027 create feedback table

Revision ID: 027
"""
from alembic import op

revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS feedback (
            id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id  UUID        NOT NULL,
            account_id UUID        NOT NULL,
            event_key  TEXT        NOT NULL,
            rating     INTEGER     NOT NULL CHECK (rating >= 1 AND rating <= 5),
            comment    TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_feedback_tenant_id ON feedback (tenant_id)")


def downgrade():
    op.execute("DROP TABLE IF EXISTS feedback")