ALTER TABLE "users" ADD COLUMN "invite_token_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "invite_expires_at" TIMESTAMPTZ(6);
CREATE UNIQUE INDEX "users_invite_token_hash_key" ON "users"("invite_token_hash");
