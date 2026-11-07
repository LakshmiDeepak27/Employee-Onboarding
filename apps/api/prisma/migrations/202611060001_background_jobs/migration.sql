-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- Store only a hash of the one-time employee invitation credential.
ALTER TABLE "users" ADD COLUMN "invite_token_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "invite_expires_at" TIMESTAMPTZ(6);
CREATE UNIQUE INDEX "users_invite_token_hash_key" ON "users"("invite_token_hash");

-- CreateEnum
CREATE TYPE "JobStage" AS ENUM ('PROFILE_INTAKE', 'JURISDICTION_RESOLUTION', 'CLAUSE_RETRIEVAL', 'PLAN_PROPOSAL', 'VALIDATION', 'GRAPH_AND_RISK', 'PERSISTED');

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" UUID NOT NULL,
    "employee_id" UUID,
    "plan_id" UUID,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "stage" "JobStage",
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "result_url" TEXT,
    "error" TEXT,
    "options" JSONB,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "background_jobs_employee_id_idx" ON "background_jobs"("employee_id");

-- CreateIndex
CREATE INDEX "background_jobs_status_idx" ON "background_jobs"("status");

