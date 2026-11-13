-- 064 down: back to the old status names. New, Resolved and Closed are unchanged.
-- Incidents that were blank before 064 stay New (the blank value is not kept).
BEGIN;

UPDATE incidents SET status = 'Open' WHERE status = 'Triaged';
UPDATE incidents SET status = 'In Progress' WHERE status = 'Investigating';
UPDATE incidents SET status = 'Under Review' WHERE status = 'Remediating';
ALTER TABLE incidents ALTER COLUMN status SET DEFAULT 'Open';

COMMIT;
