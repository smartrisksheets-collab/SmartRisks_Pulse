-- 076 down: drops join requests and the domain setting. Members already
-- added through a request stay. Safe to run more than once.
BEGIN;

DROP TABLE IF EXISTS join_requests;
DROP INDEX IF EXISTS ix_tenants_join_domain;
ALTER TABLE tenants DROP COLUMN IF EXISTS join_domain;

COMMIT;
