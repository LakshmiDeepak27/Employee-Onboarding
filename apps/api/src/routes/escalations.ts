import { Router } from "express";
import { prisma, isDatabaseOnline, setDatabaseOnline } from "../db/client.js";
import {
  PaginationQuery,
  CreateEscalationRequestSchema,
  ResolveEscalationRequestSchema,
  z,
} from "@eo/contracts";
import { authenticate, requireAuth } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { notFound } from "../lib/errors.js";
import { writeAudit } from "../lib/audit.js";

export const escalationsRouter = Router();
escalationsRouter.use(authenticate);

function presentEscalation(e: any) {
  return {
    id: e.id,
    planId: e.planId,
    taskId: e.taskId,
    taskTitle: e.task?.title ?? null,
    reasonCode: e.reasonCode,
    detail: e.detail,
    assignedRole: e.assignedRole,
    status: e.status,
    raisedByName: e.raisedBy ? `${e.raisedBy.email}` : null,
    resolution: e.resolution,
    resolvedAt: e.resolvedAt ? e.resolvedAt.toISOString() : null,
    createdAt: e.createdAt.toISOString(),
  };
}
// GET /api/v1/escalations
escalationsRouter.get(
  "/",
  requirePermission("escalation.read"),
  validate({ query: PaginationQuery }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof PaginationQuery>;

      let items: any[] = [];
      let totalItems = 0;

      if (isDatabaseOnline()) {
        try {
          const [dbItems, count] = await Promise.all([
            prisma.escalation.findMany({
              include: {
                task: { select: { title: true } },
                raisedBy: { select: { email: true } },
              },
              orderBy: { createdAt: "desc" },
              skip: (q.page - 1) * q.pageSize,
              take: q.pageSize,
            }),
            prisma.escalation.count(),
          ]);
          items = dbItems;
          totalItems = count;
        } catch {
          setDatabaseOnline(false);
          items = [];
          totalItems = 0;
        }
      }

      res.json({
        items: items.map(presentEscalation),
        meta: {
          page: q.page,
          pageSize: q.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / q.pageSize) || 1,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);
// POST /api/v1/escalations
escalationsRouter.post(
  "/",
  requirePermission("task.escalate"),
  validate({ body: CreateEscalationRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const b = req.body as z.infer<typeof CreateEscalationRequestSchema>;

      const escalation = await prisma.escalation.create({
        data: {
          reasonCode: b.reasonCode,
          detail: b.detail,
          assignedRole: b.assignedRole,
          raisedById: actor.userId,
        },
      });

      await writeAudit(req, {
        action: "escalation.created",
        resourceType: "Escalation",
        resourceId: escalation.id,
        after: { reasonCode: b.reasonCode, detail: b.detail },
      });

      res.status(201).json(presentEscalation(escalation));
    } catch (e) {
      next(e);
    }
  },
);
// PATCH /api/v1/escalations/:id
escalationsRouter.patch(
  "/:id",
  requirePermission("escalation.resolve"),
  validate({ body: ResolveEscalationRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const b = req.body as z.infer<typeof ResolveEscalationRequestSchema>;

      const existing = await prisma.escalation.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) throw notFound("Escalation");

      const resolved = await prisma.escalation.update({
        where: { id: req.params.id },
        data: {
          status: b.status,
          resolution: b.resolution,
          resolvedById: actor.userId,
          resolvedAt: new Date(),
        },
        include: {
          task: { select: { title: true } },
          raisedBy: { select: { email: true } },
        },
      });

      await writeAudit(req, {
        action: "escalation.resolved",
        resourceType: "Escalation",
        resourceId: resolved.id,
        before: { status: existing.status },
        after: { status: b.status, resolution: b.resolution },
      });

      res.json(presentEscalation(resolved));
    } catch (e) {
      next(e);
    }
  },
);
