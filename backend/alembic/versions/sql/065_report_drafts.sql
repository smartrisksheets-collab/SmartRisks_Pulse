-- 065: one saved Report Builder draft per person per workspace (UI step 7).
-- Holds the section list, report details, AI text and review marks. Live
-- figures are not stored; they are recomputed when the draft is opened.
-- Safe to run more than once.
BEGIN;

CREATE TABLE IF NOT EXISTS report_drafts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_report_drafts_tenant_account UNIQUE (tenant_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_report_drafts_tenant_id ON report_drafts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_drafts_account_id ON report_drafts(account_id);

ALTER TABLE report_drafts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON report_drafts FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON report_drafts FROM authenticated';
  END IF;
END $$;

COMMIT;
