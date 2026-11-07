-- Retire the historical seeded login identities without deleting employee,
-- plan, or audit records that may reference them. Accounts are re-provisioned
-- explicitly and their roles remain database-managed.
UPDATE "refresh_tokens"
SET "revoked_at" = CURRENT_TIMESTAMP
WHERE "user_id" IN (
  SELECT "id" FROM "users"
  WHERE "email" IN ('asha.hr@clyora', 'david.manager@clyora', 'priya@clyora')
);

DELETE FROM "user_roles"
WHERE "user_id" IN (
  SELECT "id" FROM "users"
  WHERE "email" IN ('asha.hr@clyora', 'david.manager@clyora', 'priya@clyora')
);

UPDATE "users"
SET "email" = 'retired-' || "id"::text || '@invalid.invalid',
    "status" = 'SUSPENDED',
    "password_hash" = NULL,
    "must_change_password" = TRUE,
    "auth_provider" = 'local',
    "oidc_subject" = NULL,
    "token_version" = "token_version" + 1
WHERE "email" IN ('asha.hr@clyora', 'david.manager@clyora', 'priya@clyora');
