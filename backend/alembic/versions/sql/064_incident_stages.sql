-- 064: incident stage line New, Triaged, Investigating, Remediating, Resolved, Closed (UI step 6).
-- Renames the old in-between statuses one to one. New, Resolved and Closed are unchanged.
-- Safe to run more than once: a second run finds nothing left to rename.
BEGIN;

UPDATE incidents SET status = 'Triaged' WHERE status = 'Open';
UPDATE incidents SET status = 'Investigating' WHERE status = 'In Progress';
UPDATE incidents SET status = 'Remediating' WHERE status = 'Under Review';
UPDATE incidents SET status = 'New' WHERE status IS NULL OR btrim(status) = '';
ALTER TABLE incidents ALTER COLUMN status SET DEFAULT 'New';

COMMIT;
