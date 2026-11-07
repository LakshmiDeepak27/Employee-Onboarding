ALTER TABLE "users" ADD COLUMN "auth_provider" TEXT NOT NULL DEFAULT 'local';
ALTER TABLE "users" ADD COLUMN "oidc_subject" TEXT;
CREATE UNIQUE INDEX "users_oidc_subject_key" ON "users"("oidc_subject");
