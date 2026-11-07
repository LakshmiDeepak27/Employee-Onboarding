ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invite_token_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invite_expires_at" TIMESTAMPTZ(6);
CREATE UNIQUE INDEX IF NOT EXISTS "users_invite_token_hash_key" ON "users"("invite_token_hash");
