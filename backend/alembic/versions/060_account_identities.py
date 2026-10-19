"""account identities and created_via"""
from alembic import op

revision = "060"
down_revision = "059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE accounts ADD COLUMN created_via TEXT")
    op.execute(
        "ALTER TABLE accounts ADD CONSTRAINT ck_accounts_created_via "
        "CHECK (created_via IN ('register', 'google', 'invite'))"
    )
    op.execute("""
        CREATE TABLE account_identities (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          provider TEXT NOT NULL CHECK (provider IN ('password', 'google')),
          provider_subject TEXT,
          last_used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT uq_account_identities_account_provider UNIQUE (account_id, provider)
        )
    """)
    op.execute("ALTER TABLE account_identities ENABLE ROW LEVEL SECURITY")
    op.execute("""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE 'REVOKE ALL ON account_identities FROM anon';
          END IF;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE 'REVOKE ALL ON account_identities FROM authenticated';
          END IF;
        END $$;
    """)
    op.execute("""
        UPDATE accounts a SET created_via = 'invite'
        WHERE EXISTS (
          SELECT 1 FROM workspace_members m
          WHERE m.account_id = a.id
            AND m.invited_by IS NOT NULL
            AND abs(extract(epoch FROM a.created_at - m.created_at)) < 5
        )
    """)
    op.execute(
        "UPDATE accounts SET created_via = 'google' "
        "WHERE password_hash IS NULL AND created_via IS NULL"
    )
    op.execute(
        "INSERT INTO account_identities (account_id, provider) "
        "SELECT id, 'password' FROM accounts WHERE password_hash IS NOT NULL"
    )
    op.execute(
        "INSERT INTO account_identities (account_id, provider) "
        "SELECT id, 'google' FROM accounts WHERE created_via = 'google'"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS account_identities")
    op.execute("ALTER TABLE accounts DROP CONSTRAINT IF EXISTS ck_accounts_created_via")
    op.execute("ALTER TABLE accounts DROP COLUMN IF EXISTS created_via")