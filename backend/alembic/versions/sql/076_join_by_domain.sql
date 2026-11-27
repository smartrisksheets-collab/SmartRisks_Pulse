-- 076: join by email domain.
-- tenants.join_domain: when set by an Admin (always their own sign-in domain),
-- people who sign up with that domain can ask to join. NULL means off.
-- join_requests: one row per account and workspace. An Admin approves or
-- declines; approval adds the member. Locked down like every app table.
-- Expand only. Safe to run more than once.
BEGIN;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS join_domain TEXT;
CREATE INDEX IF NOT EXISTS ix_tenants_join_domain ON tenants (lower(join_domain)) WHERE join_domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS join_requests (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    status      TEXT        NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'DECLINED')),
    decided_by  TEXT,
    decided_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_join_requests_tenant_account UNIQUE (tenant_id, account_id)
);

CREATE INDEX IF NOT EXISTS ix_join_requests_tenant_status ON join_requests (tenant_id, status);

ALTER TABLE join_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON join_requests FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON join_requests FROM authenticated';
  END IF;
END $$;

COMMIT;
