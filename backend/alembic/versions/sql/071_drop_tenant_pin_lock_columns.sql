-- 071: drop the old workspace-level PIN lock columns. Since 067 the lock is
-- counted per member (workspace_members.pin_attempts, pin_locked_until).
-- Run ONLY after the backend that no longer maps these columns is deployed,
-- or the running app fails on every workspace read. Safe to run more than once.
BEGIN;

ALTER TABLE tenants DROP COLUMN IF EXISTS pin_attempts;
ALTER TABLE tenants DROP COLUMN IF EXISTS pin_locked_until;

COMMIT;
