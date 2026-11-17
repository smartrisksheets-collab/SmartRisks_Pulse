-- 066: one evidence document per risk (control test evidence).
-- The file lives in the private Supabase Storage bucket risk-evidence.
-- evidence_path is the object path inside that bucket and is never sent to
-- the browser. All columns are nullable, so existing risks have no document.
-- Safe to run more than once.
BEGIN;

ALTER TABLE risks ADD COLUMN IF NOT EXISTS evidence_path TEXT;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS evidence_name TEXT;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS evidence_mime TEXT;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS evidence_size INTEGER;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS evidence_uploaded_at TIMESTAMPTZ;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS evidence_uploaded_by TEXT;

COMMIT;
