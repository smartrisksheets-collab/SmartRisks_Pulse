-- 067 down: puts every backfilled reviewer value back from the backup, then
-- removes the lockout columns. Current lockout counts are lost.
BEGIN;

UPDATE external_submissions x SET reviewed_by = b.old_value
FROM backfill_067_actor_ids b WHERE b.table_name = 'external_submissions' AND b.row_id = x.id;

UPDATE audit_logs x SET user_email = b.old_value
FROM backfill_067_actor_ids b WHERE b.table_name = 'audit_logs' AND b.row_id = x.id;

UPDATE activity_feed x SET user_email = b.old_value
FROM backfill_067_actor_ids b WHERE b.table_name = 'activity_feed' AND b.row_id = x.id;

UPDATE risk_history x SET changed_by = b.old_value
FROM backfill_067_actor_ids b WHERE b.table_name = 'risk_history' AND b.row_id = x.id;

DROP TABLE IF EXISTS backfill_067_actor_ids;

ALTER TABLE admin_accounts DROP COLUMN IF EXISTS locked_until;
ALTER TABLE admin_accounts DROP COLUMN IF EXISTS failed_login_attempts;
ALTER TABLE workspace_members DROP COLUMN IF EXISTS pin_locked_until;
ALTER TABLE workspace_members DROP COLUMN IF EXISTS pin_attempts;

COMMIT;
