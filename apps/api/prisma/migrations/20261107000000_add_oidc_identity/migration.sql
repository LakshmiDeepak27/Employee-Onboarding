ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_provider" TEXT NOT NULL DEFAULT 'local';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "oidc_subject" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_oidc_subject_key" ON "users"("oidc_subject");
