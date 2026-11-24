-- 068 down: removes the run claims and the escalation record. Open incidents
-- past their SLA will alert again on the next hourly run.
BEGIN;

DROP TABLE IF EXISTS scheduler_runs;
ALTER TABLE incidents DROP COLUMN IF EXISTS escalated_at;

COMMIT;
