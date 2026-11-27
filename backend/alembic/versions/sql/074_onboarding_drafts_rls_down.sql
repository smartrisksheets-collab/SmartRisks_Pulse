-- 074 down: turns RLS off again. Revoked grants are not given back, so the
-- Data API stays closed. Safe to run more than once.
BEGIN;

ALTER TABLE onboarding_drafts DISABLE ROW LEVEL SECURITY;

COMMIT;
