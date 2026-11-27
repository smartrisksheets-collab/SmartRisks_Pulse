-- 071 down: put the workspace-level PIN lock columns back, empty. Old counts
-- are not restored; they were unused after 067.
BEGIN;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pin_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;

COMMIT;
