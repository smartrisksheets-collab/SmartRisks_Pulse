-- 073 down: remove onboarding drafts. Unfinished setups are lost; finished
-- workspaces are not affected. The "Finance" to "Other Financial Services"
-- sector move is not reversed: it cannot tell which rows were moved, and
-- Settings keeps showing whatever value is saved.
BEGIN;

DROP TABLE IF EXISTS onboarding_drafts;

COMMIT;
