-- 067: per-member PIN lockout, admin sign-in lockout, and a safe backfill of
-- reviewer ids that external approvals wrote where an email belongs.
-- Adds columns only (expand step), so it is safe to run on production before
-- the code that uses it is deployed. Safe to run more than once.
BEGIN;

-- PIN lockout moves from the workspace to the member, so one person guessing
-- cannot lock the whole team out. tenants.pin_attempts and
-- tenants.pin_locked_until stay until a later contract step.
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS pin_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;

ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Backup of every value the backfill changes, so the down file can put each
-- one back exactly.
CREATE TABLE IF NOT EXISTS backfill_067_actor_ids (
  table_name  TEXT NOT NULL,
  row_id      UUID NOT NULL,
  old_value   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, row_id)
);

ALTER TABLE backfill_067_actor_ids ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON backfill_067_actor_ids FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON backfill_067_actor_ids FROM authenticated';
  END IF;
END $$;

-- A value is replaced only when it is an account id AND that account is a
-- member of the same workspace as the row. Anything else is left untouched.
INSERT INTO backfill_067_actor_ids (table_name, row_id, old_value)
SELECT 'external_submissions', x.id, x.reviewed_by
FROM external_submissions x
JOIN workspace_members m ON m.tenant_id = x.tenant_id AND m.account_id::text = x.reviewed_by
ON CONFLICT (table_name, row_id) DO NOTHING;

INSERT INTO backfill_067_actor_ids (table_name, row_id, old_value)
SELECT 'audit_logs', x.id, x.user_email
FROM audit_logs x
JOIN workspace_members m ON m.tenant_id = x.tenant_id AND m.account_id::text = x.user_email
ON CONFLICT (table_name, row_id) DO NOTHING;

INSERT INTO backfill_067_actor_ids (table_name, row_id, old_value)
SELECT 'activity_feed', x.id, x.user_email
FROM activity_feed x
JOIN workspace_members m ON m.tenant_id = x.tenant_id AND m.account_id::text = x.user_email
ON CONFLICT (table_name, row_id) DO NOTHING;

INSERT INTO backfill_067_actor_ids (table_name, row_id, old_value)
SELECT 'risk_history', x.id, x.changed_by
FROM risk_history x
JOIN workspace_members m ON m.tenant_id = x.tenant_id AND m.account_id::text = x.changed_by
ON CONFLICT (table_name, row_id) DO NOTHING;

UPDATE external_submissions x SET reviewed_by = a.email
FROM workspace_members m JOIN accounts a ON a.id = m.account_id
WHERE m.tenant_id = x.tenant_id AND a.id::text = x.reviewed_by;

UPDATE audit_logs x SET user_email = a.email
FROM workspace_members m JOIN accounts a ON a.id = m.account_id
WHERE m.tenant_id = x.tenant_id AND a.id::text = x.user_email;

UPDATE activity_feed x SET user_email = a.email
FROM workspace_members m JOIN accounts a ON a.id = m.account_id
WHERE m.tenant_id = x.tenant_id AND a.id::text = x.user_email;

UPDATE risk_history x SET changed_by = a.email
FROM workspace_members m JOIN accounts a ON a.id = m.account_id
WHERE m.tenant_id = x.tenant_id AND a.id::text = x.changed_by;

COMMIT;
