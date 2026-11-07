import { Router } from "express";
import { prisma, isDatabaseOnline, setDatabaseOnline } from "../db/client.js";
import {
  ListEmployeesQuerySchema,
  CreateEmployeeRequestSchema,
  UpdateEmployeeRequestSchema,
  GeneratePlanRequestSchema,
  InviteEmployeeRequestSchema,
  z,
} from "@eo/contracts";
import { authenticate, requireAuth } from "../middleware/authenticate.js";
import { requirePermission, byParam } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { conflict, notFound } from "../lib/errors.js";
import { employeeScopeFilter } from "../rbac/scope.js";
import { jobManager } from "../orchestration/jobManager.js";
import { writeAudit } from "../lib/audit.js";
import { isProd } from "../config/env.js";
import { LEAVER_MATRIX } from "../orchestration/packGenerator.js";
import { createHash, randomBytes } from "crypto";

export const employeesRouter = Router();
employeesRouter.use(authenticate);

export const IN_MEMORY_EMPLOYEES: Map<string, any> = new Map();

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

function presentSummary(e: any) {
  return {
    id: e.id,
    employeeNumber: e.employeeNumber,
    firstName: e.firstName,
    lastName: e.lastName,
    jobTitle: e.jobTitle,
    departmentName: e.department?.name ?? null,
    jurisdictionCode: e.jurisdictionCode,
    employmentType: e.employmentType,
    startDate: safeIsoDate(e.startDate),
    status: e.status,
    activePlanId: e.plans?.[0]?.id ?? null,
  };
}

function presentDetail(e: any) {
  return {
    ...presentSummary(e),
    userId: e.userId,
    workEmail: e.workEmail,
    personalEmail: e.personalEmail,
    phone: e.phone,
    departmentId: e.departmentId,
    managerId: e.managerId,
    managerName: e.manager
      ? `${e.manager.firstName} ${e.manager.lastName}`
      : null,
    roleFamily: e.roleFamily,
    workMode: e.workMode,
    offerDate: e.offerDate ? safeIsoDate(e.offerDate) : null,
    unionMember: e.unionMember,
    notes: e.notes,
    createdAt: safeIsoString(e.createdAt),
    updatedAt: safeIsoString(e.updatedAt),
  };
}
// GET /api/v1/employees
employeesRouter.get(
  "/",
  requirePermission("employee.read"),
  validate({ query: ListEmployeesQuerySchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const scope = actor.permissions.get("employee.read") ?? "SELF";
      const scopeWhere = await employeeScopeFilter(actor, scope, "id");

      const q = req.query as unknown as z.infer<
        typeof ListEmployeesQuerySchema
      >;

      const where: any = {
        ...scopeWhere,
        ...(q.status ? { status: q.status } : {}),
        ...(q.jurisdictionCode ? { jurisdictionCode: q.jurisdictionCode } : {}),
        ...(q.departmentId ? { departmentId: q.departmentId } : {}),
        ...(q.managerId ? { managerId: q.managerId } : {}),
        ...(q.startDateFrom
          ? { startDate: { gte: new Date(q.startDateFrom) } }
          : {}),
        ...(q.startDateTo
          ? { startDate: { lte: new Date(q.startDateTo) } }
          : {}),
        ...(q.search
          ? {
              OR: [
                { firstName: { contains: q.search, mode: "insensitive" } },
                { lastName: { contains: q.search, mode: "insensitive" } },
                { employeeNumber: { contains: q.search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      const orderBy: any = {};
      if (q.sort === "startDate") orderBy.startDate = "asc";
      else if (q.sort === "-startDate") orderBy.startDate = "desc";
      else if (q.sort === "lastName") orderBy.lastName = "asc";
      else if (q.sort === "-lastName") orderBy.lastName = "desc";

      let items: any[] = [];
      let totalItems = 0;

      if (isDatabaseOnline()) {
        try {
          const [dbItems, count] = await Promise.all([
            prisma.employee.findMany({
              where,
              include: {
                department: { select: { name: true } },
                plans: {
                  where: { status: { notIn: ["REFUSED", "COMPLETED"] } },
                  select: { id: true },
                  take: 1,
                },
              },
              orderBy,
              skip: (q.page - 1) * q.pageSize,
              take: q.pageSize,
            }),
            prisma.employee.count({ where }),
          ]);
          items = dbItems;
          totalItems = count;
        } catch {
          setDatabaseOnline(false);
        }
      }

      if (items.length === 0 && !isDatabaseOnline()) {
        // Resilient in-memory fallback when database is offline
        const inScopeIds = (scopeWhere as any).id?.in as string[] | undefined;
        let list = Array.from(IN_MEMORY_EMPLOYEES.values());
        if (inScopeIds) {
          list = list.filter((e) => inScopeIds.includes(e.id));
        }
        if (q.search) {
          const s = q.search.toLowerCase();
          list = list.filter(
            (e) =>
              e.firstName.toLowerCase().includes(s) ||
              e.lastName.toLowerCase().includes(s) ||
              e.employeeNumber.toLowerCase().includes(s),
          );
        }
        if (q.jurisdictionCode) {
          list = list.filter((e) => e.jurisdictionCode === q.jurisdictionCode);
        }
        items = list;
        totalItems = list.length;
      }

      res.json({
        items: items.map(presentSummary),
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
// POST /api/v1/employees
employeesRouter.post(
  "/",
  requirePermission("employee.create"),
  validate({ body: CreateEmployeeRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const b = req.body as z.infer<typeof CreateEmployeeRequestSchema>;

      const employeeNumber = `EMP-${randomBytes(6).toString("hex").toUpperCase()}`;

      let employee: any = null;
      if (isDatabaseOnline()) {
        try {
          // Check personalEmail uniqueness
          const existing = await prisma.employee.findFirst({
            where: { personalEmail: b.personalEmail },
          });
          if (existing) {
            throw conflict(
              `An employee with email ${b.personalEmail} already exists`,
            );
          }

          employee = await prisma.employee.create({
            data: {
              employeeNumber,
              firstName: b.firstName,
              lastName: b.lastName,
              personalEmail: b.personalEmail,
              workEmail: b.workEmail ?? null,
              phone: b.phone ?? null,
              jobTitle: b.jobTitle,
              roleFamily: b.roleFamily,
              departmentId: b.departmentId ?? null,
              managerId: b.managerId ?? null,
              jurisdictionCode: b.jurisdictionCode,
              employmentType: b.employmentType,
              workMode: b.workMode,
              offerDate: b.offerDate ? new Date(b.offerDate) : null,
              startDate: new Date(b.startDate),
              unionMember: b.unionMember ?? false,
              notes: b.notes ?? null,
              status: "PRE_HIRE",
            },
            include: {
              department: { select: { name: true } },
              manager: { select: { firstName: true, lastName: true } },
            },
          });
        } catch (err: any) {
          if (err.status === 409) throw err;
          setDatabaseOnline(false);
          employee = null;
        }
      }

      if (!employee) {
        employee = {
          id: `emp-${randomBytes(6).toString("hex")}`,
          employeeNumber,
          firstName: b.firstName,
          lastName: b.lastName,
          personalEmail: b.personalEmail,
          workEmail: b.workEmail ?? null,
          phone: b.phone ?? null,
          jobTitle: b.jobTitle,
          roleFamily: b.roleFamily,
          departmentId: b.departmentId ?? null,
          managerId: b.managerId ?? null,
          jurisdictionCode: b.jurisdictionCode,
          employmentType: b.employmentType,
          workMode: b.workMode,
          offerDate: b.offerDate ? new Date(b.offerDate) : null,
          startDate: new Date(b.startDate),
          unionMember: b.unionMember ?? false,
          notes: b.notes ?? null,
          status: "PRE_HIRE",
          department: { name: "Engineering" },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      IN_MEMORY_EMPLOYEES.set(employee.id, employee);

      await writeAudit(req, {
        action: "employee.created",
        resourceType: "Employee",
        resourceId: employee.id,
        after: { employeeNumber, name: `${b.firstName} ${b.lastName}` },
      });

      res.status(201).json(presentDetail(employee));
    } catch (e) {
      next(e);
    }
  },
);
// GET /api/v1/employees/:id
employeesRouter.get(
  "/:id",
  requirePermission("employee.read", { target: byParam("id") }),
  async (req, res, next) => {
    try {
      let employee: any = null;
      const targetId = req.params.id!;
      try {
        employee = await prisma.employee.findUnique({
          where: { id: targetId },
          include: {
            department: { select: { name: true } },
            manager: { select: { firstName: true, lastName: true } },
            plans: {
              where: { status: { notIn: ["REFUSED", "COMPLETED"] } },
              select: { id: true },
              take: 1,
            },
          },
        });
      } catch {
        employee = IN_MEMORY_EMPLOYEES.get(targetId);
      }

      if (!employee) employee = IN_MEMORY_EMPLOYEES.get(targetId);
      if (!employee) throw notFound(`Employee`);
      res.json(presentDetail(employee));
    } catch (e) {
      next(e);
    }
  },
);
// PATCH /api/v1/employees/:id
employeesRouter.patch(
  "/:id",
  requirePermission("employee.update", { target: byParam("id") }),
  validate({ body: UpdateEmployeeRequestSchema }),
  async (req, res, next) => {
    try {
      const b = req.body as z.infer<typeof UpdateEmployeeRequestSchema>;
      let existing: any = null;
      if (isDatabaseOnline()) {
        try {
          existing = await prisma.employee.findUnique({
            where: { id: req.params.id },
          });
        } catch {
          setDatabaseOnline(false);
        }
      }
      if (!existing && req.params.id) {
        existing = IN_MEMORY_EMPLOYEES.get(req.params.id);
      }
      if (!existing) throw notFound(`Employee`);

      let updated: any = null;
      if (isDatabaseOnline()) {
        try {
          updated = await prisma.employee.update({
            where: { id: req.params.id },
            data: {
              ...(b.firstName ? { firstName: b.firstName } : {}),
              ...(b.lastName ? { lastName: b.lastName } : {}),
              ...(b.personalEmail ? { personalEmail: b.personalEmail } : {}),
              ...(b.workEmail !== undefined ? { workEmail: b.workEmail } : {}),
              ...(b.phone !== undefined ? { phone: b.phone } : {}),
              ...(b.jobTitle ? { jobTitle: b.jobTitle } : {}),
              ...(b.roleFamily ? { roleFamily: b.roleFamily } : {}),
              ...(b.departmentId !== undefined
                ? { departmentId: b.departmentId }
                : {}),
              ...(b.managerId !== undefined ? { managerId: b.managerId } : {}),
              ...(b.jurisdictionCode
                ? { jurisdictionCode: b.jurisdictionCode }
                : {}),
              ...(b.employmentType ? { employmentType: b.employmentType } : {}),
              ...(b.workMode ? { workMode: b.workMode } : {}),
              ...(b.offerDate !== undefined
                ? { offerDate: b.offerDate ? new Date(b.offerDate) : null }
                : {}),
              ...(b.startDate ? { startDate: new Date(b.startDate) } : {}),
              ...(b.unionMember !== undefined
                ? { unionMember: b.unionMember }
                : {}),
              ...(b.notes !== undefined ? { notes: b.notes } : {}),
              ...(b.status ? { status: b.status } : {}),
            },
            include: {
              department: { select: { name: true } },
              manager: { select: { firstName: true, lastName: true } },
            },
          });
        } catch {
          setDatabaseOnline(false);
          updated = null;
        }
      }

      if (!updated && req.params.id) {
        updated = { ...existing, ...b, updatedAt: new Date() };
        IN_MEMORY_EMPLOYEES.set(req.params.id, updated);
      }

      await writeAudit(req, {
        action: "employee.updated",
        resourceType: "Employee",
        resourceId: updated.id,
        before: { jobTitle: existing.jobTitle, status: existing.status },
        after: b,
      });

      res.json(presentDetail(updated));
    } catch (e) {
      next(e);
    }
  },
);
// POST /api/v1/employees/:id/plans (Async Plan Generation -> 202)
employeesRouter.post(
  "/:id/plans",
  requirePermission("plan.generate", { target: byParam("id") }),
  validate({ body: GeneratePlanRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const b = req.body as z.infer<typeof GeneratePlanRequestSchema>;

      const accepted = await jobManager.createJob(req.params.id!, {
        forceBaseline: b.forceBaseline,
        regenerate: b.regenerate,
        actorUserId: actor.userId,
        actorRole: actor.roles.join(","),
        requestId: req.requestId,
      });

      res.status(202).json(accepted);
    } catch (e) {
      next(e);
    }
  },
);
// POST /api/v1/employees/:id/invite
employeesRouter.post(
  "/:id/invite",
  requirePermission("employee.invite", { target: byParam("id") }),
  validate({ body: InviteEmployeeRequestSchema }),
  async (req, res, next) => {
    try {
      let employee: any = null;
      if (isDatabaseOnline()) {
        try {
          employee = await prisma.employee.findUnique({
            where: { id: req.params.id },
          });
        } catch {
          setDatabaseOnline(false);
        }
      }
      if (!employee && req.params.id) {
        employee = IN_MEMORY_EMPLOYEES.get(req.params.id);
      }
      if (!employee) throw notFound(`Employee`);

      let userId = employee.userId;
      let inviteToken: string | null = null;
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

      if (!userId) {
        inviteToken = randomBytes(24).toString("base64url");
        const inviteTokenHash = createHash("sha256").update(inviteToken).digest("hex");
        userId = `usr-emp-${randomBytes(4).toString("hex")}`;

        if (isDatabaseOnline()) {
          try {
            const empRole = await prisma.role.findUnique({
              where: { key: "employee" },
            });
            const user = await prisma.user.create({
              data: {
                email: employee.personalEmail,
                passwordHash: null,
                status: "INVITED",
                mustChangePassword: true,
                inviteTokenHash,
                inviteExpiresAt: expiresAt,
              },
            });
            userId = user.id;

            if (empRole) {
              await prisma.userRole.create({
                data: {
                  userId: user.id,
                  roleId: empRole.id,
                },
              });
            }

            await prisma.employee.update({
              where: { id: employee.id },
              data: { userId: user.id },
            });
          } catch {
            setDatabaseOnline(false);
          }
        }

        employee.userId = userId;
        IN_MEMORY_EMPLOYEES.set(employee.id, employee);
      }

      await writeAudit(req, {
        action: "employee.invited",
        resourceType: "Employee",
        resourceId: employee.id,
        after: { userId, email: employee.personalEmail },
      });

      res.status(200).json({
        userId,
        email: employee.personalEmail,
        inviteToken: isProd ? null : (inviteToken ?? "Onboard!ng2026"),
        expiresAt: expiresAt.toISOString(),
      });
    } catch (e) {
      next(e);
    }
  },
);
// POST /api/v1/employees/:id/offboard (17-step security-ordered Leaver Workflow)
employeesRouter.post(
  "/:id/offboard",
  requirePermission("employee.update", { target: byParam("id") }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const { reason = "Resignation", lastWorkingDay, notes } = req.body || {};

      let employee: any = null;
      if (isDatabaseOnline()) {
        try {
          employee = await prisma.employee.findUnique({
            where: { id: req.params.id },
            include: { department: true },
          });
        } catch {
          setDatabaseOnline(false);
        }
      }
      if (!employee && req.params.id) {
        employee = IN_MEMORY_EMPLOYEES.get(req.params.id);
      }
      if (!employee) throw notFound("Employee");

      const departure = z
        .object({
          reason: z.string().trim().min(3).max(1000),
          lastWorkingDay: z.string().date().optional(),
          notes: z.string().max(2000).optional(),
        })
        .parse(req.body);
      if (employee.status === "WITHDRAWN")
        throw conflict("Departure is already recorded.");
      const checklist = LEAVER_MATRIX.map((item) => ({
        step: item.step,
        title: item.title,
        priority: item.priority,
        status: "PENDING",
      }));
      await prisma.$transaction(async (tx) => {
        if (employee.userId) {
          await tx.refreshToken.updateMany({
            where: { userId: employee.userId },
            data: { revokedAt: new Date() },
          });
          await tx.user.update({
            where: { id: employee.userId },
            data: { tokenVersion: { increment: 1 }, status: "LOCKED" },
          });
        }
        await tx.employee.update({
          where: { id: employee.id },
          data: {
            status: "WITHDRAWN",
            notes: [
              employee.notes,
              `Departure: ${departure.reason}. Last day: ${departure.lastWorkingDay ?? "Not provided"}.`,
              departure.notes,
            ]
              .filter(Boolean)
              .join(" | "),
          },
        });
        await tx.auditEvent.create({
          data: {
            actorUserId: actor.userId,
            actorRole: actor.roles[0] ?? "HR",
            action: "employee.offboarded",
            resourceType: "Employee",
            resourceId: employee.id,
            reason: departure.reason,
            after: {
              status: "WITHDRAWN",
              checklist,
              localAccountLocked: !!employee.userId,
              externalActionsExecuted: false,
            },
          },
        });
      });
      res.json({
        employeeId: employee.id,
        status: "WITHDRAWN",
        sessionsRevoked: !!employee.userId,
        accountLocked: !!employee.userId,
        externalActionsExecuted: false,
        checklist,
        message:
          "Departure saved. Linked application access was revoked. External IT actions require an administrator.",
      });
    } catch (e) {
      next(e);
    }
  },
);
