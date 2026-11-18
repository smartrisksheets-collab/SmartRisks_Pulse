-- 063 down: removes the risk title column. Titles entered since 063 are lost.
BEGIN;

ALTER TABLE risks DROP COLUMN IF EXISTS title;

COMMIT;
