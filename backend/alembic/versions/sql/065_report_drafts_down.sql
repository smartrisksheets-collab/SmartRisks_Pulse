-- 065 down: removes saved Report Builder drafts. Every saved draft is lost.
BEGIN;

DROP TABLE IF EXISTS report_drafts;

COMMIT;
