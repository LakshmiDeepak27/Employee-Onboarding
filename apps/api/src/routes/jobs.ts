import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { prisma } from "../db/client.js";
import { requirePermission } from "../middleware/authorize.js";
import { jobManager } from "../orchestration/jobManager.js";

export const jobsRouter = Router();
jobsRouter.use(authenticate);
// GET /api/v1/jobs/:id
jobsRouter.get(
  "/:id",
  requirePermission("plan.read", {
    target: async (req) =>
      (
        await prisma.backgroundJob.findUnique({
          where: { id: req.params.id },
          select: { employeeId: true },
        })
      )?.employeeId ?? null,
  }),
  async (req, res, next) => {
    try {
      const jobState = await jobManager.getJob(req.params.id!);
      res.json(jobState);
    } catch (e) {
      next(e);
    }
  },
);
