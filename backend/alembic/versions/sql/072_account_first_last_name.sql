-- 072: first and last name on accounts (expand only).
-- accounts.name stays as the full name; the app now writes all three together.
-- Fills both columns for existing accounts by splitting name at the first space,
-- with runs of spaces collapsed. Safe to run more than once.
-- Run BEFORE deploying the backend that maps these columns.
BEGIN;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS first_name VARCHAR;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_name VARCHAR;

UPDATE accounts AS a
SET first_name = split_part(c.clean, ' ', 1),
    last_name  = NULLIF(btrim(substr(c.clean, length(split_part(c.clean, ' ', 1)) + 1)), '')
FROM (
    SELECT id, btrim(regexp_replace(name, '\s+', ' ', 'g')) AS clean
    FROM accounts
    WHERE first_name IS NULL AND name IS NOT NULL
) AS c
WHERE a.id = c.id AND c.clean <> '';

COMMIT;
