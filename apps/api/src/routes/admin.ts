import { Router } from "express";
import { prisma } from "../db/client.js";
import {
  ListUsersQuerySchema,
  CreateUserRequestSchema,
  UpdateUserRequestSchema,
  AssignRolesRequestSchema,
  z,
  Uuid,
} from "@eo/contracts";
import { authenticate, requireAuth } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { conflict, notFound } from "../lib/errors.js";
import { hashPassword } from "../auth/service.js";
import { invalidatePermissionCache } from "../rbac/permissions.js";
import { writeAudit } from "../lib/audit.js";

export const adminRouter = Router();
adminRouter.use(authenticate);

const userSelect = {
  id: true,
  email: true,
  status: true,
  mustChangePassword: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  employee: { select: { id: true, firstName: true, lastName: true } },
  userRoles: { select: { role: { select: { key: true } } } },
} as const;

type UserRow = {
  id: string;
  email: string;
  status: string;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  lockedUntil: Date | null;
  createdAt: Date;
  employee: { id: string; firstName: string; lastName: string } | null;
  userRoles: { role: { key: string } }[];
};

function present(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    status: u.status,
    mustChangePassword: u.mustChangePassword,
    employeeId: u.employee?.id ?? null,
    employeeName: u.employee
      ? `${u.employee.firstName} ${u.employee.lastName}`
      : null,
    roles: u.userRoles.map((r) => r.role.key),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    lockedUntil: u.lockedUntil?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}
// GET /api/v1/admin/users
adminRouter.get(
  "/users",
  requirePermission("user.read"),
  validate({ query: ListUsersQuerySchema }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof ListUsersQuerySchema>;
      const where = {
        ...(q.status ? { status: q.status } : {}),
        ...(q.search
          ? { email: { contains: q.search, mode: "insensitive" as const } }
          : {}),
        ...(q.role ? { userRoles: { some: { role: { key: q.role } } } } : {}),
      };
      const [items, totalItems] = await Promise.all([
        prisma.user.findMany({
          where,
          select: userSelect,
          orderBy: { createdAt: "desc" },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        prisma.user.count({ where }),
      ]);
      res.json({
        items: items.map((u) => present(u as UserRow)),
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
// POST /api/v1/admin/users
adminRouter.post(
  "/users",
  requirePermission("user.create"),
  validate({ body: CreateUserRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const input = req.body as z.infer<typeof CreateUserRequestSchema>;

      if (
        await prisma.user.findUnique({
          where: { email: input.email },
          select: { id: true },
        })
      ) {
        throw conflict("That email is already registered");
      }

      const roles = await prisma.role.findMany({
        where: { key: { in: input.roles } },
        select: { id: true, key: true },
      });
      if (roles.length !== input.roles.length) {
        throw notFound("One or more roles");
      }

      const created = await prisma.user.create({
        data: {
          email: input.email,
          status: input.temporaryPassword ? "ACTIVE" : "INVITED",
          mustChangePassword: true,
          ...(input.temporaryPassword
            ? { passwordHash: await hashPassword(input.temporaryPassword) }
            : {}),
          ...(input.employeeId
            ? { employee: { connect: { id: input.employeeId } } }
            : {}),
          userRoles: {
            create: roles.map((r) => ({
              roleId: r.id,
              grantedById: actor.userId,
            })),
          },
        },
        select: userSelect,
      });

      await writeAudit(req, {
        action: "user.created",
        resourceType: "user",
        resourceId: created.id,
        after: { email: created.email, roles: input.roles },
      });

      res.status(201).json(present(created as UserRow));
    } catch (e) {
      next(e);
    }
  },
);
// PATCH /api/v1/admin/users/:id
adminRouter.patch(
  "/users/:id",
  requirePermission("user.update"),
  validate({ params: z.object({ id: Uuid }), body: UpdateUserRequestSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const input = req.body as z.infer<typeof UpdateUserRequestSchema>;

      const before = await prisma.user.findUnique({
        where: { id },
        select: userSelect,
      });
      if (!before) throw notFound("User");

      const updated = await prisma.user.update({
        where: { id },
        data: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.unlock ? { lockedUntil: null, failedLoginCount: 0 } : {}),
          // Bumping tokenVersion kills every live access token at once.
          ...(input.forceLogout ? { tokenVersion: { increment: 1 } } : {}),
        },
        select: userSelect,
      });

      if (input.forceLogout) {
        await prisma.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      invalidatePermissionCache(id);

      await writeAudit(req, {
        action: "user.updated",
        resourceType: "user",
        resourceId: id,
        before: { status: before.status },
        after: { status: updated.status, ...input },
      });

      res.json(present(updated as UserRow));
    } catch (e) {
      next(e);
    }
  },
);
// PUT /api/v1/admin/users/:id/roles
adminRouter.put(
  "/users/:id/roles",
  requirePermission("role.assign"),
  validate({ params: z.object({ id: Uuid }), body: AssignRolesRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const { id } = req.params as { id: string };
      const input = req.body as z.infer<typeof AssignRolesRequestSchema>;

      const existing = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          userRoles: { select: { role: { select: { key: true } } } },
        },
      });
      if (!existing) throw notFound("User");

      const roles = await prisma.role.findMany({
        where: { key: { in: input.roles } },
        select: { id: true, key: true },
      });
      if (roles.length !== input.roles.length)
        throw notFound("One or more roles");

      const beforeKeys = existing.userRoles.map((r) => r.role.key);

      await prisma.$transaction(async (tx) => {
        if (input.mode === "REPLACE") {
          await tx.userRole.deleteMany({ where: { userId: id } });
          await tx.userRole.createMany({
            data: roles.map((r) => ({
              userId: id,
              roleId: r.id,
              grantedById: actor.userId,
            })),
          });
        } else if (input.mode === "ADD") {
          await tx.userRole.createMany({
            data: roles.map((r) => ({
              userId: id,
              roleId: r.id,
              grantedById: actor.userId,
            })),
            skipDuplicates: true,
          });
        } else {
          await tx.userRole.deleteMany({
            where: { userId: id, roleId: { in: roles.map((r) => r.id) } },
          });
        }
      });

      // Role changes must take effect immediately, not at token expiry.
      invalidatePermissionCache(id);

      const after = await prisma.user.findUniqueOrThrow({
        where: { id },
        select: userSelect,
      });
      const afterKeys = after.userRoles.map((r) => r.role.key);

      await prisma.authEvent.createMany({
        data: [
          ...afterKeys
            .filter((k) => !beforeKeys.includes(k))
            .map((k) => ({
              userId: id,
              email: existing.email,
              type: "ROLE_GRANTED" as const,
              success: true,
              reason: k,
            })),
          ...beforeKeys
            .filter((k) => !afterKeys.includes(k))
            .map((k) => ({
              userId: id,
              email: existing.email,
              type: "ROLE_REVOKED" as const,
              success: true,
              reason: k,
            })),
        ],
      });

      await writeAudit(req, {
        action: "user.roles_changed",
        resourceType: "user",
        resourceId: id,
        before: { roles: beforeKeys },
        after: { roles: afterKeys },
        reason: input.reason ?? null,
      });

      res.json(present(after as UserRow));
    } catch (e) {
      next(e);
    }
  },
);
// GET /api/v1/admin/roles
adminRouter.get(
  "/roles",
  requirePermission("role.read"),
  async (_req, res, next) => {
    try {
      const roles = await prisma.role.findMany({
        orderBy: { key: "asc" },
        select: {
          id: true,
          key: true,
          name: true,
          description: true,
          isSystem: true,
          rolePermissions: {
            select: { scope: true, permission: { select: { key: true } } },
            orderBy: { permission: { key: "asc" } },
          },
        },
      });
      res.json(
        roles.map((r) => ({
          id: r.id,
          key: r.key,
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
          permissions: r.rolePermissions.map((rp) => ({
            key: rp.permission.key,
            scope: rp.scope,
          })),
        })),
      );
    } catch (e) {
      next(e);
    }
  },
);
