-- 070: single-use refresh tokens. Each refresh token is recorded here when it
-- is used (rotated) or when its owner logs out, and is refused after that.
-- A row can be deleted once expires_at has passed.
-- Safe to run on production before the code that uses it. Safe to run more
-- than once.
BEGIN;

CREATE TABLE IF NOT EXISTS revoked_refresh_tokens (
  jti         TEXT PRIMARY KEY,
  account_id  UUID NOT NULL,
  reason      TEXT NOT NULL,
  revoked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_refresh_tokens_expires_at ON revoked_refresh_tokens(expires_at);

ALTER TABLE revoked_refresh_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON revoked_refresh_tokens FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON revoked_refresh_tokens FROM authenticated';
  END IF;
END $$;

COMMIT;
