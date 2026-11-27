-- 073: onboarding drafts. One row per account holds the setup wizard answers
-- so far, so a closed tab resumes on the same step on any device. The
-- workspace itself is still created in one go at the end (finish), and the
-- row is deleted then. Rows untouched for 30 days are purged daily.
-- Also moves workspaces saved under the old "Finance" sector to
-- "Other Financial Services", which replaced it (decision of 2026-11-27).
-- Safe to run more than once.
BEGIN;

CREATE TABLE IF NOT EXISTS onboarding_drafts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    step        SMALLINT    NOT NULL DEFAULT 1 CHECK (step BETWEEN 1 AND 3),
    data        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_onboarding_drafts_account UNIQUE (account_id)
);

CREATE INDEX IF NOT EXISTS ix_onboarding_drafts_updated_at ON onboarding_drafts (updated_at);

UPDATE tenants SET industry = 'Other Financial Services' WHERE industry = 'Finance';

COMMIT;
