import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import {
  prisma,
  isDatabaseOnline,
  setDatabaseOnline,
  isDatabaseConnectivityError,
  databaseUnavailableError,
  type AuthEventType,
} from "../db/client.js";
import { env } from "../config/env.js";
import { AppError, badRequest, conflict, unauthenticated } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  newFamilyId,
} from "./tokens.js";
import {
  invalidatePermissionCache,
  resolvePermissions,
  toEffectiveList,
} from "../rbac/permissions.js";

export interface RequestMeta {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

/** LOCKED with no expiry is an administrative/offboarding lock. */
function isAccountUnavailable(status: string, lockedUntil: Date | null | undefined) {
  return status === "SUSPENDED" ||
    (status === "LOCKED" && (!lockedUntil || lockedUntil > new Date()));
}

async function recordAuthEvent(input: {
  userId?: string | null;
  email?: string | null;
  type: AuthEventType;
  success: boolean;
  reason?: string;
  meta: RequestMeta;
}) {
  if (isDatabaseOnline()) {
    try {
      await prisma.authEvent.create({
        data: {
          userId: input.userId ?? null,
          email: input.email ?? null,
          type: input.type,
          success: input.success,
          reason: input.reason ?? null,
          ipAddress: input.meta.ipAddress ?? null,
          userAgent: input.meta.userAgent ?? null,
        },
      });
    } catch (error) {
      if (isDatabaseConnectivityError(error)) throw databaseUnavailableError(error);
      throw error;
    }
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export async function buildSession(
  userId: string,
  meta: RequestMeta,
  familyId?: string,
) {
  let user: any = null;
  if (isDatabaseOnline()) {
    try {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          status: true,
          lockedUntil: true,
          mustChangePassword: true,
          tokenVersion: true,
          lastLoginAt: true,
          employee: { select: { id: true, firstName: true, lastName: true } },
          userRoles: { select: { role: { select: { key: true } } } },
        },
      });
    } catch (error) {
      if (isDatabaseConnectivityError(error)) throw databaseUnavailableError(error);
      throw error;
    }
  }

  if (!user) throw unauthenticated("User not found");
  if (isAccountUnavailable(user.status, user.lockedUntil)) {
    throw unauthenticated("This account is locked or suspended.", "ACCOUNT_LOCKED");
  }

  const roles = user.userRoles.map((r: any) => r.role.key);
  const access = signAccessToken({
    userId: user.id,
    email: user.email,
    employeeId: user.employee?.id ?? null,
    roles,
    tokenVersion: user.tokenVersion,
  });

  const fam = familyId ?? newFamilyId();
  const refresh = signRefreshToken({ userId: user.id, familyId: fam });

  if (isDatabaseOnline()) {
    try {
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(refresh.token),
          familyId: fam,
          expiresAt: refresh.expiresAt,
          userAgent: meta.userAgent ?? null,
          ipAddress: meta.ipAddress ?? null,
        },
      });
    } catch (error) {
      if (isDatabaseConnectivityError(error)) throw databaseUnavailableError(error);
      throw error;
    }
  }

  const permissions = await resolvePermissions(user.id);

  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    tokenType: "Bearer" as const,
    expiresIn: access.expiresInSeconds,
    user: {
      id: user.id,
      email: user.email,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      employeeId: user.employee?.id ?? null,
      firstName: user.employee?.firstName ?? null,
      lastName: user.employee?.lastName ?? null,
      roles,
      permissions: toEffectiveList(permissions),
    },
  };
}
// Signup

export async function signup(
  input: {
    fullName: string;
    email: string;
    password: string;
    company?: string;
    role?: string;
  },
  meta: RequestMeta,
) {
  const email = input.email.toLowerCase().trim();
  const roleKey = roleForClyoraEmail(email);

  let createdUser: any = null;
  if (isDatabaseOnline()) {
    try {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw conflict(`Email '${email}' is already registered`);

      const roleRow = await prisma.role.findUnique({ where: { key: roleKey } });
      if (!roleRow) {
        throw new AppError(503, "UPSTREAM_UNAVAILABLE", "Role configuration is unavailable.", { expose: true });
      }
      const passwordHash = await hashPassword(input.password);

      createdUser = await prisma.user.create({
        data: {
          email,
          passwordHash,
          status: "ACTIVE",
          userRoles: { create: [{ roleId: roleRow.id }] },
        },
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      setDatabaseOnline(false);
      throw e;
    }
  }

  if (!createdUser) throw new AppError(503, "UPSTREAM_UNAVAILABLE", "Database unavailable.", { expose: true });

  return buildSession(createdUser.id, meta);
}

/**
 * CLYORA's training-environment identity convention. Authorization still comes
 * from the database role assigned here; the frontend cannot choose a role.
 */
function roleForClyoraEmail(email: string): "hr_admin" | "manager" | "employee" {
  const match = /^([a-z0-9][a-z0-9._-]*)@clyora$/.exec(email);
  if (!match) {
    throw badRequest(
      "Use a CLYORA work email: username.hr@clyora, username.manager@clyora, or username@clyora.",
    );
  }

  const localPart = match[1]!;
  if (localPart.endsWith(".hr")) return "hr_admin";
  if (localPart.endsWith(".manager")) return "manager";
  return "employee";
}
// Login

export async function login(
  email: string,
  password: string,
  meta: RequestMeta,
) {
  let user: any = null;
  if (isDatabaseOnline()) {
    try {
      user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          status: true,
          failedLoginCount: true,
          lockedUntil: true,
        },
      });
    } catch (error) {
      if (isDatabaseConnectivityError(error)) throw databaseUnavailableError(error);
      throw error;
    }
  }

  // Always compare against *something* so a missing account and a wrong
  // password take similar time. Prevents trivial user enumeration by timing.
  const hash =
    user?.passwordHash ??
    "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
  const passwordOk = await bcrypt.compare(password, hash);

  if (!user) throw unauthenticated("Invalid email or password");

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAuthEvent({
      userId: user.id,
      email,
      type: "LOGIN_FAILED",
      success: false,
      reason: "locked",
      meta,
    });
    throw new AppError(
      423,
      "ACCOUNT_LOCKED",
      `Account is locked until ${user.lockedUntil.toISOString()}`,
    );
  }

  if (user.status === "SUSPENDED" || (user.status === "LOCKED" && !user.lockedUntil)) {
    await recordAuthEvent({
      userId: user.id,
      email,
      type: "LOGIN_FAILED",
      success: false,
      reason: "suspended",
      meta,
    });
    throw unauthenticated("Account is suspended");
  }

  if (!user.passwordHash || !passwordOk) {
    const failed = user.failedLoginCount + 1;
    const shouldLock = failed >= env.MAX_FAILED_LOGINS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: shouldLock ? 0 : failed,
        lockedUntil: shouldLock
          ? new Date(Date.now() + env.LOCKOUT_MINUTES * 60_000)
          : null,
        ...(shouldLock ? { status: "LOCKED" as const } : {}),
      },
    });
    await recordAuthEvent({
      userId: user.id,
      email,
      type: shouldLock ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
      success: false,
      reason: shouldLock ? `locked after ${failed} failures` : "bad password",
      meta,
    });
    if (shouldLock) {
      throw new AppError(
        423,
        "ACCOUNT_LOCKED",
        `Too many failed attempts. Account locked for ${env.LOCKOUT_MINUTES} minutes.`,
      );
    }
    throw unauthenticated("Invalid email or password");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      ...(user.status === "INVITED" || user.status === "LOCKED"
        ? { status: "ACTIVE" as const }
        : {}),
    },
  });

  await recordAuthEvent({
    userId: user.id,
    email,
    type: "LOGIN_SUCCESS",
    success: true,
    meta,
  });
  return buildSession(user.id, meta);
}

export async function loginWithOidc(subject: string, email: string, meta: RequestMeta) {
  const normalizedEmail = email.toLowerCase().trim();
  const [bySubject, byVerifiedEmail] = await Promise.all([
    prisma.user.findUnique({
      where: { oidcSubject: subject },
      select: { id: true, oidcSubject: true, status: true, email: true, lockedUntil: true },
    }),
    prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, oidcSubject: true, status: true, email: true, lockedUntil: true },
    }),
  ]);

  // Reject conflicting mappings: subject and email point to different users
  if (bySubject && byVerifiedEmail && bySubject.id !== byVerifiedEmail.id) {
    await recordAuthEvent({
      email: normalizedEmail,
      type: "LOGIN_FAILED",
      success: false,
      reason: "Conflicting SSO identity: subject and email belong to different accounts",
      meta,
    });
    throw unauthenticated("The SSO identity conflicts with the provisioned account", "TOKEN_INVALID");
  }

  // Reject if email is already bound to a different subject
  if (byVerifiedEmail?.oidcSubject && byVerifiedEmail.oidcSubject !== subject) {
    await recordAuthEvent({
      userId: byVerifiedEmail.id,
      email: normalizedEmail,
      type: "LOGIN_FAILED",
      success: false,
      reason: `Account already linked to subject ${byVerifiedEmail.oidcSubject}, received ${subject}`,
      meta,
    });
    throw unauthenticated("The SSO identity conflicts with the provisioned account", "TOKEN_INVALID");
  }

  // Reject if subject is already bound to a different email
  if (bySubject && bySubject.email.toLowerCase() !== normalizedEmail) {
    await recordAuthEvent({
      userId: bySubject.id,
      email: normalizedEmail,
      type: "LOGIN_FAILED",
      success: false,
      reason: `SSO subject is linked to ${bySubject.email}, but login presented ${normalizedEmail}`,
      meta,
    });
    throw unauthenticated("The SSO identity conflicts with the provisioned account", "TOKEN_INVALID");
  }

  const user = bySubject ?? byVerifiedEmail;

  if (!user) {
    await recordAuthEvent({
      email: normalizedEmail,
      type: "LOGIN_FAILED",
      success: false,
      reason: "OIDC identity is not provisioned",
      meta,
    });
    throw unauthenticated(
      "This Keycloak email is not provisioned in CLYORA. Bootstrap the initial HR email in the app database; managers and employees need an HR invitation and app role.",
    );
  }

  if (isAccountUnavailable(user.status, user.lockedUntil)) {
    await recordAuthEvent({
      userId: user.id,
      email: normalizedEmail,
      type: "LOGIN_FAILED",
      success: false,
      reason: "Account suspended",
      meta,
    });
    throw unauthenticated("Account is suspended");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAuthEvent({
      userId: user.id,
      email: normalizedEmail,
      type: "LOGIN_FAILED",
      success: false,
      reason: "Account locked",
      meta,
    });
    throw unauthenticated("Account is temporarily locked");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      oidcSubject: subject,
      authProvider: "oidc",
      lastLoginAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
      status: user.status === "INVITED" || user.status === "LOCKED" ? "ACTIVE" : user.status,
    },
  });
  await recordAuthEvent({ userId: user.id, email: normalizedEmail, type: "LOGIN_SUCCESS", success: true, meta });
  return buildSession(user.id, meta);
}

export async function acceptInvite(token: string, newPassword: string, meta: RequestMeta) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const user = await prisma.user.findFirst({
    where: { inviteTokenHash: tokenHash },
    select: { id: true, email: true, status: true, inviteExpiresAt: true, lockedUntil: true },
  });
  if (!user || !user.inviteExpiresAt || user.inviteExpiresAt <= new Date()) {
    throw unauthenticated("Invitation is invalid or expired", "TOKEN_INVALID");
  }
  if (isAccountUnavailable(user.status, user.lockedUntil)) {
    throw unauthenticated("Account is suspended or locked");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      status: "ACTIVE",
      mustChangePassword: false,
      inviteTokenHash: null,
      inviteExpiresAt: null,
      lastLoginAt: new Date(),
    },
  });
  await recordAuthEvent({ userId: user.id, email: user.email, type: "LOGIN_SUCCESS", success: true, meta });
  return buildSession(user.id, meta);
}
// Refresh — rotation with reuse detection

export async function refresh(rawToken: string, meta: RequestMeta) {
  const claims = verifyRefreshToken(rawToken);
  const tokenHash = hashToken(rawToken);

  let stored: any = null;
  if (isDatabaseOnline()) {
    try {
      stored = await prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          familyId: true,
          revokedAt: true,
          expiresAt: true,
        },
      });
    } catch {
      // DB offline fallback
    }
  }

  if (stored && stored.revokedAt) {
    /**
     * REUSE DETECTION. A revoked token being presented means someone has a
     * copy of a token we already rotated away. We cannot tell the victim from
     * the attacker, so we revoke the entire family and force a fresh login.
     */
    try {
      await prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await recordAuthEvent({
        userId: stored.userId,
        type: "TOKEN_REUSE_DETECTED",
        success: false,
        reason: `family ${stored.familyId} revoked`,
        meta,
      });
    } catch {
      // ignore
    }
    logger.warn(
      { userId: stored.userId, familyId: stored.familyId },
      "refresh token reuse detected",
    );
    throw unauthenticated(
      "Session compromised, please sign in again",
      "TOKEN_INVALID",
    );
  }

  if (stored && stored.expiresAt <= new Date()) {
    throw unauthenticated("Refresh token has expired", "TOKEN_EXPIRED");
  }

  const userId = stored?.userId || claims.sub;
  const famId = stored?.familyId || claims.fam;

  // Issue rotated token pair
  const session = await buildSession(userId, meta, famId);

  try {
    if (stored && isDatabaseOnline()) {
      const replacement = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(session.refreshToken) },
        select: { id: true },
      });

      await prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), replacedById: replacement?.id ?? null },
      });

      await recordAuthEvent({
        userId,
        type: "TOKEN_REFRESHED",
        success: true,
        meta,
      });
    }
  } catch {
    // ignore
  }

  const { user: _user, ...tokens } = session;
  return tokens;
}
// Logout

export async function logout(
  userId: string,
  rawToken: string | undefined,
  allDevices: boolean,
  meta: RequestMeta,
) {
  if (isDatabaseOnline()) {
    try {
      if (allDevices) {
        await prisma.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await prisma.user.update({
          where: { id: userId },
          data: { tokenVersion: { increment: 1 } },
        });
        invalidatePermissionCache(userId);
      } else if (rawToken) {
        await prisma.refreshToken.updateMany({
          where: { tokenHash: hashToken(rawToken), revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await recordAuthEvent({ userId, type: "LOGOUT", success: true, meta });
    } catch {
      // ignore
    }
  }
}
// Change password

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  meta: RequestMeta,
) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true },
  });

  if (
    !user.passwordHash ||
    !(await bcrypt.compare(currentPassword, user.passwordHash))
  ) {
    await recordAuthEvent({
      userId,
      email: user.email,
      type: "PASSWORD_CHANGED",
      success: false,
      reason: "current password incorrect",
      meta,
    });
    throw unauthenticated("Current password is incorrect");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        // Invalidate every live session: changing a password must sign you
        // out everywhere, including any session an attacker may hold.
        tokenVersion: { increment: 1 },
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  invalidatePermissionCache(userId);
  await recordAuthEvent({
    userId,
    email: user.email,
    type: "PASSWORD_CHANGED",
    success: true,
    meta,
  });
}
// Current user

export async function getMe(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      status: true,
      mustChangePassword: true,
      lastLoginAt: true,
      employee: { select: { id: true, firstName: true, lastName: true } },
      userRoles: { select: { role: { select: { key: true } } } },
    },
  });
  const permissions = await resolvePermissions(userId);
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    employeeId: user.employee?.id ?? null,
    firstName: user.employee?.firstName ?? null,
    lastName: user.employee?.lastName ?? null,
    roles: user.userRoles.map((r) => r.role.key),
    permissions: toEffectiveList(permissions),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

export { conflict };
