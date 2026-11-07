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
import { AppError, conflict, notFound } from "../lib/errors.js";
import { employeeScopeFilter } from "../rbac/scope.js";
import { jobManager } from "../orchestration/jobManager.js";
import { inviteRateLimit, planGenerationRateLimit } from "../middleware/rateLimit.js";
import { writeAudit } from "../lib/audit.js";
import { LEAVER_MATRIX } from "../orchestration/packGenerator.js";
import { randomBytes, createHash } from "crypto";
import { env } from "../config/env.js";
import { provisionKeycloakUserAndSendActivation } from "../auth/keycloakAdmin.js";

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
  const latestPlan = e.plans?.[0] ?? null;
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
    activePlanId:
      latestPlan && !["COMPLETED", "REFUSED"].includes(latestPlan.status)
        ? latestPlan.id
        : null,
    latestPlanId: latestPlan?.id ?? null,
    latestPlanStatus: latestPlan?.status ?? null,
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
                  where: { status: { not: "REFUSED" } },
                  select: { id: true, status: true },
                  orderBy: { createdAt: "desc" },
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
          if (!b.managerId) {
            throw new AppError(400, "VALIDATION_FAILED", "Select a reporting manager so the new employee appears in that manager's team workspace.");
          }
          const managerProfile = await prisma.employee.findUnique({
            where: { id: b.managerId },
            select: { id: true, userId: true },
          });
          if (!managerProfile?.userId) {
            throw new AppError(400, "VALIDATION_FAILED", "The selected manager does not have a linked CLYORA account. Link the manager account before creating this employee.");
          }
          const managerAccount = await prisma.user.findFirst({
            where: {
              id: managerProfile.userId,
              status: "ACTIVE",
              userRoles: { some: { role: { key: { in: ["manager", "hr_admin"] } } } },
            },
            select: { id: true },
          });
          if (!managerAccount) {
            throw new AppError(400, "VALIDATION_FAILED", "The selected reporting manager must have the manager role in CLYORA.");
          }

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
          if (err instanceof AppError && err.status < 500) throw err;
          setDatabaseOnline(false);
          employee = null;
        }
      }

      if (!employee) {
        throw new AppError(503, "UPSTREAM_UNAVAILABLE", "The employee record could not be saved. Please retry when the database is available.");
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
// GET /api/v1/employees/managers
// Only linked manager/HR identities can be assigned. HR staff may also be a
// reporting manager, and every option maps directly to an employee profile.
employeesRouter.get(
  "/managers",
  requirePermission("employee.create"),
  async (_req, res, next) => {
    try {
      if (!isDatabaseOnline()) {
        throw new AppError(503, "UPSTREAM_UNAVAILABLE", "Manager accounts could not be loaded because the employee database is unavailable.");
      }
      const managerUsers = await prisma.user.findMany({
        where: {
          status: "ACTIVE",
          userRoles: { some: { role: { key: { in: ["manager", "hr_admin"] } } } },
          employee: { isNot: null },
        },
        select: {
          id: true,
          email: true,
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              jobTitle: true,
              department: { select: { name: true } },
            },
          },
        },
        orderBy: { email: "asc" },
      });
      res.json(managerUsers.flatMap((user) => user.employee ? [{
        id: user.employee.id,
        firstName: user.employee.firstName,
        lastName: user.employee.lastName,
        jobTitle: user.employee.jobTitle,
        departmentName: user.employee.department?.name ?? null,
        email: user.email,
      }] : []));
    } catch (error) {
      next(error);
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
              where: { status: { not: "REFUSED" } },
              select: { id: true, status: true },
              orderBy: { createdAt: "desc" },
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
  planGenerationRateLimit,
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
  inviteRateLimit,
  requirePermission("employee.invite", { target: byParam("id") }),
  validate({ body: InviteEmployeeRequestSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as { sendEmail?: boolean };
      if (body.sendEmail === false) {
        throw new AppError(400, "VALIDATION_FAILED", "Employee activation must be sent by email; no reusable password is created or shared.");
      }
      if (!isDatabaseOnline()) {
        throw new AppError(503, "UPSTREAM_UNAVAILABLE", "The employee database is unavailable. The invitation was not sent.");
      }
      const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
      if (!employee) throw notFound(`Employee`);

      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      const rawToken = randomBytes(24).toString("base64url");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");

      const userId = await prisma.$transaction(async (tx) => {
        const employeeRole = await tx.role.findUnique({ where: { key: "employee" } });
        if (!employeeRole) throw new AppError(503, "UPSTREAM_UNAVAILABLE", "The employee role is not configured. Run the database seed first.");
        let user = employee.userId
          ? await tx.user.findUnique({ where: { id: employee.userId }, include: { userRoles: { include: { role: true } } } })
          : await tx.user.findUnique({ where: { email: employee.personalEmail }, include: { userRoles: { include: { role: true } } } });
        if (user && !user.userRoles.some((entry) => entry.role.key === "employee")) {
          throw conflict("This email is already linked to an account with a different role.");
        }
        if (user?.status === "SUSPENDED") {
          throw conflict("This portal account is suspended. An administrator must review it before sending an activation email.");
        }
        if (user?.status === "ACTIVE") {
          throw conflict("This employee account is already active. Use the organization's account recovery process if they cannot sign in.");
        }
        if (employee.userId && user && user.email.toLowerCase() !== employee.personalEmail.toLowerCase()) {
          throw conflict("The linked portal account email does not match this employee's personal email.");
        }
        if (!user) {
          user = await tx.user.create({
            data: {
              email: employee.personalEmail,
              passwordHash: null,
              authProvider: "oidc",
              status: "INVITED",
              mustChangePassword: true,
              inviteTokenHash: tokenHash,
              inviteExpiresAt: expiresAt,
              userRoles: { create: [{ roleId: employeeRole.id }] },
            },
            include: { userRoles: { include: { role: true } } },
          });
        } else {
          await tx.user.update({
            where: { id: user.id },
            data: {
              status: "INVITED",
              mustChangePassword: true,
              inviteTokenHash: tokenHash,
              inviteExpiresAt: expiresAt,
            },
          });
        }
        if (!user.userRoles.some((entry) => entry.role.key === "employee")) {
          await tx.userRole.create({ data: { userId: user.id, roleId: employeeRole.id } });
        }
        if (employee.userId !== user.id) {
          await tx.employee.update({ where: { id: employee.id }, data: { userId: user.id } });
        }
        return user.id;
      });

      // Employees sign in with the CLYORA work identity (e.g. alex@clyora).
      // Keep the real personal email as Keycloak's verified email so it can
      // receive the activation message and map the OIDC identity to CLYORA.
      const keycloakUsername = (employee.workEmail || employee.personalEmail.split("@")[0] || "employee").toLowerCase();
      let activationEmailSent = false;
      try {
        await provisionKeycloakUserAndSendActivation({
          username: keycloakUsername,
          email: employee.personalEmail,
          firstName: employee.firstName,
          lastName: employee.lastName,
        });
        activationEmailSent = true;
      } catch {
        // If Keycloak admin service-account or SMTP is not configured in this environment,
        // we log gracefully and fall back to the secure one-time invite link.
        activationEmailSent = false;
      }

      const frontendBase = env.CORS_ORIGIN.split(",")[0]!.trim();
      const inviteUrl = `${frontendBase}/signup?token=${rawToken}`;

      await writeAudit(req, {
        action: "employee.invited",
        resourceType: "Employee",
        resourceId: employee.id,
        after: { userId, email: employee.personalEmail, keycloakUsername, activationEmailSent },
      });

      res.status(202).json({
        userId,
        email: employee.personalEmail,
        username: keycloakUsername,
        activationEmailSent,
        inviteUrl,
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
