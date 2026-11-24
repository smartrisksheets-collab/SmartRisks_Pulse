-- 069: clash-free ID numbers (R-001, INC-2026-001, SUB-2026-0001) from one
-- counter row per workspace, a unique rule on submission references, and the
-- index the pending outside-submissions list needs.
-- Safe to run on production before the code that uses it. Safe to run more
-- than once.
BEGIN;

-- The next number is taken with one atomic upsert, so two people saving at
-- the same moment get different numbers. Rows are created on first use.
CREATE TABLE IF NOT EXISTS id_counters (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope       TEXT NOT NULL,
  last_value  INT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, scope)
);

ALTER TABLE id_counters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON id_counters FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON id_counters FROM authenticated';
  END IF;
END $$;

-- Submission references must be unique per workspace. If duplicates already
-- exist (from the old count-based numbering), the rule is skipped with a
-- notice instead of failing, so nothing a submitter was emailed is renamed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM risk_submissions GROUP BY workspace_id, reference HAVING count(*) > 1
  ) THEN
    RAISE NOTICE '069: duplicate submission references exist; unique index not created. Run the duplicate check in the notes.';
  ELSE
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_risk_submissions_workspace_reference ON risk_submissions(workspace_id, reference)';
  END IF;
END $$;

-- Gap 22: the pending list filters outside submissions by workspace and status.
CREATE INDEX IF NOT EXISTS idx_external_submissions_tenant_status ON external_submissions(tenant_id, status);

COMMIT;
