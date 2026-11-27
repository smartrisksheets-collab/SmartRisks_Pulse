-- 074: lock down onboarding_drafts like every other app table (073 missed it).
-- RLS on with no policy, and no access for the Supabase anon and
-- authenticated roles, so the public anon key cannot read drafts through the
-- Data API. The backend connects as the table owner, so it is unaffected.
-- Safe to run more than once.
BEGIN;

ALTER TABLE onboarding_drafts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON onboarding_drafts FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON onboarding_drafts FROM authenticated';
  END IF;
END $$;

COMMIT;
