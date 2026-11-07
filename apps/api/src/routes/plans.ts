import { Router } from "express";
import { prisma, isDatabaseOnline, isDatabaseConnectivityError, databaseUnavailableError } from "../db/client.js";
import {
  ListPlansQuerySchema,
  ApprovePlanRequestSchema,
  FinalizeOnboardingRequestSchema,
  UpdatePlanTaskRequestSchema,
  z,
} from "@eo/contracts";
import { authenticate, requireAuth } from "../middleware/authenticate.js";
import { requirePermission, byParam } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { employeeScopeFilter, employeeIdForPlan } from "../rbac/scope.js";
import { orchestrator } from "../orchestration/orchestrator.js";
import {
  generateOnboardingPack,
  buildZipPackBuffer,
} from "../orchestration/packGenerator.js";

export const plansRouter = Router();
plansRouter.use(authenticate);

function safeIsoDate(d: any): string {
  if (!d) return "";
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  if (typeof d === "string") return d.slice(0, 10);
  return String(d).slice(0, 10);
}

function safeIsoString(d: any): string {
  if (!d) return new Date().toISOString();
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

function presentPlanSummary(p: any) {
  const tasks = p.tasks ?? [];
  const completedCount = tasks.filter(
    (t: any) => t.status === "COMPLETED" || t.status === "SKIPPED",
  ).length;
  const atRiskCount = tasks.filter((t: any) => t.isAtRisk).length;
  const needsReviewCount = tasks.filter(
    (t: any) => t.reviewState === "NEEDS_REVIEW",
  ).length;

  return {
    id: p.id,
    employeeId: p.employeeId,
    employeeName: p.employee
      ? `${p.employee.firstName} ${p.employee.lastName}`
      : "Unknown",
    jurisdictionCode: p.employee?.jurisdictionCode ?? "",
    startDate: safeIsoDate(p.employee?.startDate),
    status: p.status,
    generationMode: p.generationMode,
    taskCount: tasks.length,
    completedCount,
    atRiskCount,
    needsReviewCount,
    confidence: p.confidence ? Number(p.confidence) : null,
    createdAt: safeIsoString(p.createdAt),
  };
}

function presentTask(t: any) {
  return {
    id: t.id,
    planId: t.planId,
    taskType: t.taskType,
    service: t.service,
    title: t.title.replace(/^DEMO\s*[—-]\s*/i, "").trim(),
    description: t.description,
    ownerRole: t.ownerRole,
    assigneeUserId: t.assigneeUserId,
    assigneeName: t.assignee ? `${t.assignee.email}` : null,
    dueDate: safeIsoDate(t.dueDate),
    earliestStartDate: safeIsoDate(t.earliestStartDate),
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
    completedAt: t.completedAt ? safeIsoString(t.completedAt) : null,
    createdAt: safeIsoString(t.createdAt),
  };
}
// GET /api/v1/plans
plansRouter.get(
  "/",
  requirePermission("plan.read"),
  validate({ query: ListPlansQuerySchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const scope = actor.permissions.get("plan.read") ?? "SELF";
      const scopeWhere = await employeeScopeFilter(actor, scope, "employeeId");

      const q = req.query as unknown as z.infer<typeof ListPlansQuerySchema>;

      const where: any = {
        ...scopeWhere,
        ...(q.status ? { status: q.status } : {}),
        ...(q.employeeId ? { AND: [{ employeeId: q.employeeId }] } : {}),
        ...(q.atRiskOnly ? { tasks: { some: { isAtRisk: true } } } : {}),
      };

      let items: any[] = [];
      let totalItems = 0;

      if (isDatabaseOnline()) {
        const [dbItems, count] = await Promise.all([
          prisma.onboardingPlan.findMany({
            where,
            include: {
              employee: {
                select: {
                  firstName: true,
                  lastName: true,
                  jurisdictionCode: true,
                  startDate: true,
                },
              },
              tasks: {
                select: { status: true, isAtRisk: true, reviewState: true },
              },
            },
            orderBy: { createdAt: "desc" },
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
          }),
          prisma.onboardingPlan.count({ where }),
        ]);
        items = dbItems;
        totalItems = count;
      }

      res.json({
        items: items.map(presentPlanSummary),
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
// GET /api/v1/plans/:id
plansRouter.get(
  "/:id",
  requirePermission("plan.read", {
    target: (req) => employeeIdForPlan(req.params.id!),
  }),
  async (req, res, next) => {
    try {
      let plan: any = null;
      if (isDatabaseOnline()) {
        plan = await prisma.onboardingPlan.findUnique({
          where: { id: req.params.id },
          include: {
            employee: {
              select: {
                firstName: true,
                lastName: true,
                jurisdictionCode: true,
                startDate: true,
              },
            },
            approvedBy: { select: { email: true } },
            tasks: {
              include: {
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
              orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }],
            },
          },
        });
      }

      if (!plan) throw notFound("Plan");

      const summary = presentPlanSummary(plan);

      res.json({
        ...summary,
        refusalReason: plan.refusalReason,
        confidenceBreakdown: plan.confidenceBreakdown as any,
        modelName: plan.modelName,
        promptVersion: plan.promptVersion,
        approvedById: plan.approvedById,
        approvedByName: plan.approvedBy?.email ?? null,
        approvedAt: plan.approvedAt ? safeIsoString(plan.approvedAt) : null,
        tasks: (plan.tasks ?? []).map(presentTask),
        degradedReason:
          plan.generationMode === "BASELINE_FALLBACK"
            ? "Generated from task templates statutory baseline."
            : null,
        updatedAt: safeIsoString(plan.updatedAt),
      });
    } catch (e) {
      next(e);
    }
  },
);
// POST /api/v1/plans/:id/approval
plansRouter.post(
  "/:id/approval",
  requirePermission("plan.approve"),
  validate({ body: ApprovePlanRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const b = req.body as z.infer<typeof ApprovePlanRequestSchema>;

      const result = await orchestrator.approvePlan(req.params.id!, {
        decision: b.decision,
        taskIds: b.taskIds,
        reason: b.reason,
        acknowledgement: b.acknowledgement,
        actorUserId: actor.userId,
        actorName: actor.email,
        actorRole: actor.roles.join(","),
        requestId: req.requestId,
      });

      res.json(result);
    } catch (e) {
      next(e);
    }
  },
);
plansRouter.post(
  "/:id/completion-approval",
  requirePermission("plan.approve", { target: (req) => employeeIdForPlan(req.params.id!) }),
  validate({ body: FinalizeOnboardingRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const body = req.body as z.infer<typeof FinalizeOnboardingRequestSchema>;
      const result = await orchestrator.finalizeOnboarding(req.params.id!, {
        actorUserId: actor.userId,
        actorName: actor.email,
        actorRole: actor.roles.join(","),
        reason: body.reason,
        requestId: req.requestId,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);
// GET /api/v1/plans/:id/graph
plansRouter.get(
  "/:id/graph",
  requirePermission("plan.read", {
    target: (req) => employeeIdForPlan(req.params.id!),
  }),
  async (req, res, next) => {
    try {
      const graph = await orchestrator.getPlanGraph(req.params.id!);
      res.json(graph);
    } catch (e) {
      next(e);
    }
  },
);
// GET /api/v1/plans/:id/pack (IT & HR Onboarding Pack Artifacts)
plansRouter.get(
  "/:id/pack",
  requirePermission("plan.approve", {
    target: (req) => employeeIdForPlan(req.params.id!),
  }),
  async (req, res, next) => {
    try {
      let plan: any = null;
      let employee: any = null;
      if (isDatabaseOnline()) {
        plan = await prisma.onboardingPlan.findUnique({
          where: { id: req.params.id },
          include: {
            employee: { include: { department: true } },
            tasks: true,
          },
        });
        if (plan) employee = plan.employee;
      }
      if (!plan) throw notFound("Plan");

      if (!employee) {
        const { IN_MEMORY_EMPLOYEES } = await import("./employees.js");
        employee =
          (req.params.id && IN_MEMORY_EMPLOYEES.get(plan.employeeId)) ??
          plan.employee;
      }
      if (!employee) throw notFound("Employee for Plan");

      const pack = generateOnboardingPack(plan, employee);
      res.json(pack);
    } catch (e) {
      next(e);
    }
  },
);
// GET /api/v1/plans/:id/pack/zip (Downloadable ZIP Archive)
plansRouter.get(
  "/:id/pack/zip",
  requirePermission("plan.approve", {
    target: (req) => employeeIdForPlan(req.params.id!),
  }),
  async (req, res, next) => {
    try {
      let plan: any = null;
      let employee: any = null;
      if (isDatabaseOnline()) {
        plan = await prisma.onboardingPlan.findUnique({
          where: { id: req.params.id },
          include: {
            employee: { include: { department: true } },
            tasks: true,
          },
        });
        if (plan) employee = plan.employee;
      }
      if (!plan) throw notFound("Plan");

      if (!employee) {
        const { IN_MEMORY_EMPLOYEES } = await import("./employees.js");
        employee =
          (req.params.id && IN_MEMORY_EMPLOYEES.get(plan.employeeId)) ??
          plan.employee;
      }
      if (!employee) throw notFound("Employee for Plan");

      const pack = generateOnboardingPack(plan, employee);
      const zipBuffer = buildZipPackBuffer(pack);

      const filename = `onboarding-pack-${employee.employeeNumber || plan.id}.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.setHeader("Content-Length", zipBuffer.length);
      res.end(zipBuffer);
    } catch (e) {
      next(e);
    }
  },
);
// GET /api/v1/plans/:id/risks
plansRouter.get(
  "/:id/risks",
  requirePermission("plan.read", {
    target: (req) => employeeIdForPlan(req.params.id!),
  }),
  async (req, res, next) => {
    try {
      const risks = await orchestrator.getPlanRisks(req.params.id!);
      res.json(risks);
    } catch (e) {
      next(e);
    }
  },
);
// GET /api/v1/plans/:id/findings
plansRouter.get(
  "/:id/findings",
  requirePermission("finding.read", {
    target: (req) => employeeIdForPlan(req.params.id!),
  }),
  async (req, res, next) => {
    try {
      let findings: any[] = [];
      if (isDatabaseOnline()) {
        try {
          findings = await prisma.validationFinding.findMany({
            where: { planId: req.params.id },
            include: { task: { select: { title: true } } },
            orderBy: { createdAt: "desc" },
          });
        } catch (error) {
          if (isDatabaseConnectivityError(error)) throw databaseUnavailableError(error);
          throw error;
        }
      }

      res.json({
        items: findings.map((f) => ({
          id: f.id,
          taskId: f.taskId,
          taskTitle: f.task?.title ?? null,
          validator: f.validator,
          severity: f.severity,
          code: f.code,
          message: f.message,
          detail: f.detail as any,
          action: f.action,
          createdAt: f.createdAt.toISOString(),
        })),
        meta: {
          page: 1,
          pageSize: findings.length || 1,
          totalItems: findings.length,
          totalPages: 1,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);
// GET /api/v1/plans/:id/audit
plansRouter.get(
  "/:id/audit",
  requirePermission("audit.read", {
    target: (req) => employeeIdForPlan(req.params.id!),
  }),
  async (req, res, next) => {
    try {
      let events: any[] = [];
      if (isDatabaseOnline()) {
        try {
          events = await prisma.auditEvent.findMany({
            where: {
              resourceType: "OnboardingPlan",
              resourceId: req.params.id,
            },
            include: { actor: { select: { email: true } } },
            orderBy: { createdAt: "desc" },
          });
        } catch (error) {
          if (isDatabaseConnectivityError(error)) throw databaseUnavailableError(error);
          throw error;
        }
      }

      res.json({
        items: events.map((ev) => ({
          id: String(ev.id),
          actorName: ev.actor?.email ?? null,
          actorRole: ev.actorRole,
          action: ev.action,
          resourceType: ev.resourceType,
          resourceId: ev.resourceId,
          before: ev.before as any,
          after: ev.after as any,
          reason: ev.reason,
          requestId: ev.requestId,
          createdAt: ev.createdAt.toISOString(),
        })),
        meta: {
          page: 1,
          pageSize: events.length || 1,
          totalItems: events.length,
          totalPages: 1,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);
// PATCH /api/v1/plans/:id/tasks/:taskId
plansRouter.patch(
  "/:id/tasks/:taskId",
  requirePermission("task.update", {
    target: (req) => employeeIdForPlan(req.params.id!),
  }),
  validate({ body: UpdatePlanTaskRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const b = req.body as z.infer<typeof UpdatePlanTaskRequestSchema>;
      const target = await prisma.planTask.findUnique({
        where: { id: req.params.taskId },
      });
      if (!target || target.planId !== req.params.id) throw notFound("Task");
      if (
        actor.roles.includes("manager") &&
        !actor.roles.includes("hr_admin") &&
        target.service !== "MANAGER"
      ) {
        throw forbidden("Managers may update only manager-owned onboarding tasks.");
      }
      if (b.reviewState && !actor.permissions.has("plan.approve"))
        throw forbidden("Only plan reviewers may change review decisions.");
      if (b.status === "COMPLETED" || b.status === "SKIPPED")
        throw badRequest(
          "Complete tasks through their service-specific verification workflow.",
        );

      const updated = await orchestrator.updateTask(
        req.params.id!,
        req.params.taskId!,
        {
          ownerRole: b.ownerRole,
          assigneeUserId: b.assigneeUserId,
          dueDate: b.dueDate,
          status: b.status,
          reviewState: b.reviewState,
          description: b.description,
          reason: b.reason,
        },
        { userId: actor.userId, role: actor.roles.join(",") },
      );

      res.json(presentTask(updated));
    } catch (e) {
      next(e);
    }
  },
);
