import { prisma } from "../db/client.js";
import { notFound } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { orchestrator, type GeneratePlanOptions } from "./orchestrator.js";

export class BackgroundJobManager {
  async createJob(employeeId: string, options: GeneratePlanOptions = {}) {
    const { job, created } = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${employeeId}))`;
      const active = await tx.backgroundJob.findFirst({
        where: { employeeId, status: { in: ["QUEUED", "RUNNING"] } },
      });
      if (active) return { job: active, created: false };
      const job = await tx.backgroundJob.create({
        data: {
          employeeId,
          status: "QUEUED",
          stage: "PROFILE_INTAKE",
          progressPercent: 0,
          options: options as any,
        },
      });
      return { job, created: true };
    });
    if (!created)
      return {
        jobId: job.id,
        status: job.status,
        pollUrl: `/api/v1/jobs/${job.id}`,
      };
    setImmediate(() => {
      void this.executeJob(job.id, employeeId, options).catch(async (error) => {
        logger.error(
          {
            jobId: job.id,
            error: error instanceof Error ? error.message : "Unknown failure",
          },
          "Plan generation failed",
        );
        try {
          await prisma.backgroundJob.update({
            where: { id: job.id },
            data: {
              status: "FAILED",
              error:
                "Plan generation failed. Review the server log using the job ID, then retry.",
              finishedAt: new Date(),
            },
          });
        } catch {
          logger.error(
            { jobId: job.id },
            "Could not persist failed job status",
          );
        }
      });
    });
    return {
      jobId: job.id,
      status: job.status,
      pollUrl: `/api/v1/jobs/${job.id}`,
    };
  }

  async executeJob(
    jobId: string,
    employeeId: string,
    options: GeneratePlanOptions,
  ) {
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "RUNNING",
        stage: "PLAN_PROPOSAL",
        progressPercent: 10,
        startedAt: new Date(),
      },
    });
    const result = await orchestrator.generatePlan(employeeId, options);
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "SUCCEEDED",
        stage: "PERSISTED",
        progressPercent: 100,
        planId: result.planId,
        resultUrl: `/api/v1/plans/${result.planId}`,
        finishedAt: new Date(),
      },
    });
  }

  async getJob(jobId: string) {
    const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    if (!job) throw notFound("Background job");
    return {
      jobId: job.id,
      status: job.status,
      stage: job.stage,
      progressPercent: job.progressPercent,
      resultUrl: job.resultUrl,
      error: job.error,
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
    };
  }
}
export const jobManager = new BackgroundJobManager();
