-- 066 down: removes the evidence document columns from risks. The record of
-- which file belongs to which risk is lost; files in the bucket stay.
BEGIN;

ALTER TABLE risks DROP COLUMN IF EXISTS evidence_uploaded_by;
ALTER TABLE risks DROP COLUMN IF EXISTS evidence_uploaded_at;
ALTER TABLE risks DROP COLUMN IF EXISTS evidence_size;
ALTER TABLE risks DROP COLUMN IF EXISTS evidence_mime;
ALTER TABLE risks DROP COLUMN IF EXISTS evidence_name;
ALTER TABLE risks DROP COLUMN IF EXISTS evidence_path;

COMMIT;
