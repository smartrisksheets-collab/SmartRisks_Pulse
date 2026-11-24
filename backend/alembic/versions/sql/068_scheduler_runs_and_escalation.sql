-- 068: one run per scheduled slot across all app copies, and a record of
-- when an incident's SLA breach alert was sent so it is sent once.
-- Adds a column and a table only (expand step), so it is safe to run on
-- production before the code that uses it. Safe to run more than once.
BEGIN;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

-- Each scheduled job slot (job id + minute) can be claimed by one app copy.
CREATE TABLE IF NOT EXISTS scheduler_runs (
  job_id      TEXT NOT NULL,
  slot        TIMESTAMPTZ NOT NULL,
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_scheduler_runs_claimed_at ON scheduler_runs(claimed_at);

ALTER TABLE scheduler_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON scheduler_runs FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON scheduler_runs FROM authenticated';
  END IF;
END $$;

COMMIT;
