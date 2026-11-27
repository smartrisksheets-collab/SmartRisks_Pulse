-- 075: profile photo on accounts. One public URL per account, stored in the
-- workspace-logos bucket under avatars/<account id>/. Never used in reports.
-- Expand only. Safe to run more than once. accounts already has RLS on.
BEGIN;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMIT;
