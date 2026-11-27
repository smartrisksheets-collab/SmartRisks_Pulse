-- 072 down: remove the first and last name columns. accounts.name is untouched,
-- so no name is lost.
BEGIN;

ALTER TABLE accounts DROP COLUMN IF EXISTS last_name;
ALTER TABLE accounts DROP COLUMN IF EXISTS first_name;

COMMIT;
