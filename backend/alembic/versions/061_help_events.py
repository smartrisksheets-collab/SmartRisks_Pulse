"""help events for Ask Pulse"""
from alembic import op

revision = "061"
down_revision = "060"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE help_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
          event TEXT NOT NULL CHECK (event IN ('no_results', 'open', 'contact')),
          entry_id TEXT,
          query TEXT CHECK (char_length(query) <= 200),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX idx_help_events_tenant_id ON help_events(tenant_id)")
    op.execute("CREATE INDEX idx_help_events_event_created ON help_events(event, created_at DESC)")
    op.execute("ALTER TABLE help_events ENABLE ROW LEVEL SECURITY")
    op.execute("""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE 'REVOKE ALL ON help_events FROM anon';
          END IF;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE 'REVOKE ALL ON help_events FROM authenticated';
          END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS help_events")