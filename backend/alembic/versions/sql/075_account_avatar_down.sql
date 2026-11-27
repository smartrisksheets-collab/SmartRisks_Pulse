-- 075 down: drops the photo column. Files in storage are left for the
-- weekly orphan sweep. Safe to run more than once.
BEGIN;

ALTER TABLE accounts DROP COLUMN IF EXISTS avatar_url;

COMMIT;
