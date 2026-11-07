import { Router } from "express";
import { prisma, isDatabaseOnline, isDatabaseConnectivityError, databaseUnavailableError } from "../db/client.js";
import { ListTasksQuerySchema, z } from "@eo/contracts";
import { authenticate, requireAuth } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { employeeScopeFilter } from "../rbac/scope.js";

export const tasksRouter = Router();
tasksRouter.use(authenticate);

function cleanTaskTitle(title: string) {
  return title.replace(/\b(?:DEMO|SAMPLE)\s*[—–:-]\s*/gi, "").replace(/\s*\(demo\)\s*$/i, "").replace(/\s{2,}/g, " ").trim();
}

function presentTask(t: any) {
  return {
    id: t.id,
    planId: t.planId,
    employeeName: t.plan?.employee
      ? `${t.plan.employee.firstName} ${t.plan.employee.lastName}`
      : null,
    taskType: t.taskType,
    service: t.service,
    title: cleanTaskTitle(t.title),
    description: t.description,
    ownerRole: t.ownerRole,
    assigneeUserId: t.assigneeUserId,
    assigneeName: t.assignee ? `${t.assignee.email}` : null,
    dueDate: t.dueDate.toISOString().slice(0, 10),
    earliestStartDate: t.earliestStartDate.toISOString().slice(0, 10),
    authorityClass: t.authorityClass,
    origin: t.origin,
    reviewState: t.reviewState,
    status: t.status,
    isAtRisk: t.isAtRisk,
    riskReason: t.riskReason,
    onCriticalPath: t.onCriticalPath,
    dependsOn: (t.dependencies ?? []).map((d: any) => d.dependsOnId),
    citations: (t.citations ?? []).map((c: any) => ({
      id: c.id,
      clauseId: c.clauseId,
      clauseHeading: c.clause?.heading ?? null,
      documentTitle: c.clause?.document?.title ?? "Policy Document",
      isMock: c.clause?.document?.isMock ?? true,
      quotedText: c.quotedText,
      quoteMatch: c.quoteMatch ? Number(c.quoteMatch) : 1.0,
      retrievalRank: c.retrievalRank ?? null,
    })),
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  };
}
// GET /api/v1/tasks
tasksRouter.get(
  "/",
  requirePermission("task.read"),
  validate({ query: ListTasksQuerySchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const scope = actor.permissions.get("task.read") ?? "SELF";
      const scopeWhere = await employeeScopeFilter(
        actor,
        scope,
        "plan.employeeId",
      );

      const q = req.query as unknown as z.infer<typeof ListTasksQuerySchema>;

      const where: any = {
        ...(scopeWhere["plan.employeeId"]
          ? {
              plan: {
                employeeId: (scopeWhere["plan.employeeId"] as any).in
                  ? { in: (scopeWhere["plan.employeeId"] as any).in }
                  : undefined,
              },
            }
          : {}),
        ...(q.service ? { service: q.service } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.ownerRole ? { ownerRole: q.ownerRole } : {}),
        ...(q.assigneeUserId ? { assigneeUserId: q.assigneeUserId } : {}),
        ...(q.planId ? { planId: q.planId } : {}),
        ...(q.employeeId
          ? { AND: [{ plan: { employeeId: q.employeeId } }] }
          : {}),
        ...(q.dueBefore ? { dueDate: { lte: new Date(q.dueBefore) } } : {}),
        ...(q.atRiskOnly ? { isAtRisk: true } : {}),
      };

      let items: any[] = [];
      let totalItems = 0;
      if (isDatabaseOnline()) {
        const [dbItems, count] = await Promise.all([
          prisma.planTask.findMany({
            where,
            include: {
              plan: { select: { employee: { select: { firstName: true, lastName: true } } } },
              assignee: { select: { email: true } },
              dependencies: true,
              citations: {
                include: {
                  clause: {
                    include: {
                      document: { select: { title: true, isMock: true } },
                    },
                  },
                },
              },
            },
            orderBy: { dueDate: "asc" },
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
          }),
          prisma.planTask.count({ where }),
        ]);
        items = dbItems;
        totalItems = count;
      }

      res.json({
        items: items.map(presentTask),
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
