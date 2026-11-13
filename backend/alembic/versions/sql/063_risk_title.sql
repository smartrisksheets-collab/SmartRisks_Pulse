-- 063: short risk title shown in the register, panel and form (UI step 5).
-- Nullable: risks created before this change keep showing the start of their description.
-- Safe to run more than once.
BEGIN;

ALTER TABLE risks ADD COLUMN IF NOT EXISTS title TEXT;

COMMIT;
