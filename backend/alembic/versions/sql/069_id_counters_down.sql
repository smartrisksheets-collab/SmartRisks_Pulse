-- 069 down: removes the counters and the two indexes. ID numbers go back to
-- being worked out from the highest existing one.
BEGIN;

DROP INDEX IF EXISTS idx_external_submissions_tenant_status;
DROP INDEX IF EXISTS uq_risk_submissions_workspace_reference;
DROP TABLE IF EXISTS id_counters;

COMMIT;
