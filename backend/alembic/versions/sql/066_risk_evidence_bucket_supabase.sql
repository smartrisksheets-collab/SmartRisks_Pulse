-- 066 Supabase only (not run by Alembic): the private bucket for risk evidence.
-- Run once in the Supabase SQL editor of each project (staging and production).
-- public = false: files are reachable only through short-lived signed links
-- that the backend issues. The backend uses the service key, so no storage
-- policies are added for anon or authenticated.
-- Safe to run more than once.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'risk-evidence', 'risk-evidence', false, 10485760,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
