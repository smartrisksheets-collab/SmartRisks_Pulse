-- 070 down: refresh tokens become reusable until they expire, as before.
BEGIN;

DROP TABLE IF EXISTS revoked_refresh_tokens;

COMMIT;
