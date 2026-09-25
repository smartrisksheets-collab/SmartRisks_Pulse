"""create dashboard_briefs

Revision ID: 056
Revises: 055
Create Date: 2026-09-25
"""
from alembic import op

revision = '056'
down_revision = '055'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS dashboard_briefs (
            tenant_id    UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
            paragraphs   JSONB NOT NULL DEFAULT '[]'::jsonb,
            facts_hash   TEXT NOT NULL,
            generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            generated_by TEXT
        )
    """)
    op.execute("ALTER TABLE dashboard_briefs ENABLE ROW LEVEL SECURITY")
    op.execute("""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE 'REVOKE ALL ON dashboard_briefs FROM anon';
          END IF;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE 'REVOKE ALL ON dashboard_briefs FROM authenticated';
          END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS dashboard_briefs")