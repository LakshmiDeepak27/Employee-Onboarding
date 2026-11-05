import bcrypt from 'bcryptjs';
import { prisma, type AuthEventType } from '../db/client.js';
import { env } from '../config/env.js';
import { AppError, conflict, unauthenticated } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  newFamilyId,
} from './tokens.js';
import { invalidatePermissionCache, resolvePermissions, toEffectiveList } from '../rbac/permissions.js';

export interface RequestMeta {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

async function recordAuthEvent(input: {
  userId?: string | null;
  email?: string | null;
  type: AuthEventType;
  success: boolean;
  reason?: string;
  meta: RequestMeta;
}) {
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
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

async function buildSession(userId: string, meta: RequestMeta, familyId?: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      status: true,
      mustChangePassword: true,
      tokenVersion: true,
      lastLoginAt: true,
      employee: { select: { id: true, firstName: true, lastName: true } },
      userRoles: { select: { role: { select: { key: true } } } },
    },
  });

  const roles = user.userRoles.map((r) => r.role.key);
  const access = signAccessToken({
    userId: user.id,
    email: user.email,
    employeeId: user.employee?.id ?? null,
    roles,
    tokenVersion: user.tokenVersion,
  });

  const fam = familyId ?? newFamilyId();
  const refresh = signRefreshToken({ userId: user.id, familyId: fam });

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

  const permissions = await resolvePermissions(user.id);

  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    tokenType: 'Bearer' as const,
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

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function login(email: string, password: string, meta: RequestMeta) {
  const user = await prisma.user.findUnique({
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

  // Always compare against *something* so a missing account and a wrong
  // password take similar time. Prevents trivial user enumeration by timing.
  const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const passwordOk = await bcrypt.compare(password, hash);

  if (!user) {
    await recordAuthEvent({
      email,
      type: 'LOGIN_FAILED',
      success: false,
      reason: 'no such user',
      meta,
    });
    throw unauthenticated('Invalid email or password');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAuthEvent({
      userId: user.id,
      email,
      type: 'LOGIN_FAILED',
      success: false,
      reason: 'locked',
      meta,
    });
    throw new AppError(
      423,
      'ACCOUNT_LOCKED',
      `Account is locked until ${user.lockedUntil.toISOString()}`,
    );
  }

  if (user.status === 'SUSPENDED') {
    await recordAuthEvent({
      userId: user.id,
      email,
      type: 'LOGIN_FAILED',
      success: false,
      reason: 'suspended',
      meta,
    });
    throw unauthenticated('Account is suspended');
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
        ...(shouldLock ? { status: 'LOCKED' as const } : {}),
      },
    });
    await recordAuthEvent({
      userId: user.id,
      email,
      type: shouldLock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
      success: false,
      reason: shouldLock ? `locked after ${failed} failures` : 'bad password',
      meta,
    });
    if (shouldLock) {
      throw new AppError(
        423,
        'ACCOUNT_LOCKED',
        `Too many failed attempts. Account locked for ${env.LOCKOUT_MINUTES} minutes.`,
      );
    }
    throw unauthenticated('Invalid email or password');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      ...(user.status === 'INVITED' || user.status === 'LOCKED'
        ? { status: 'ACTIVE' as const }
        : {}),
    },
  });

  await recordAuthEvent({ userId: user.id, email, type: 'LOGIN_SUCCESS', success: true, meta });
  return buildSession(user.id, meta);
}

// ---------------------------------------------------------------------------
// Refresh — rotation with reuse detection
// ---------------------------------------------------------------------------

export async function refresh(rawToken: string, meta: RequestMeta) {
  const claims = verifyRefreshToken(rawToken);
  const tokenHash = hashToken(rawToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, familyId: true, revokedAt: true, expiresAt: true },
  });

  if (!stored) {
    // Signature was valid but we have no record: the token was already
    // rotated away and pruned, or it is forged. Treat as theft.
    await prisma.refreshToken.updateMany({
      where: { familyId: claims.fam, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAuthEvent({
      userId: claims.sub,
      type: 'TOKEN_REUSE_DETECTED',
      success: false,
      reason: 'unknown token hash',
      meta,
    });
    throw unauthenticated('Refresh token is not recognised', 'TOKEN_INVALID');
  }

  if (stored.revokedAt) {
    /**
     * REUSE DETECTION. A revoked token being presented means someone has a
     * copy of a token we already rotated away. We cannot tell the victim from
     * the attacker, so we revoke the entire family and force a fresh login.
     */
    await prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAuthEvent({
      userId: stored.userId,
      type: 'TOKEN_REUSE_DETECTED',
      success: false,
      reason: `family ${stored.familyId} revoked`,
      meta,
    });
    logger.warn({ userId: stored.userId, familyId: stored.familyId }, 'refresh token reuse detected');
    throw unauthenticated('Session compromised, please sign in again', 'TOKEN_INVALID');
  }

  if (stored.expiresAt <= new Date()) {
    throw unauthenticated('Refresh token has expired', 'TOKEN_EXPIRED');
  }

  // Rotate: issue a new pair in the same family, then revoke the old token
  // and link it to its replacement so the chain is auditable.
  const session = await buildSession(stored.userId, meta, stored.familyId);
  const replacement = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(session.refreshToken) },
    select: { id: true },
  });

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date(), replacedById: replacement?.id ?? null },
  });

  await recordAuthEvent({
    userId: stored.userId,
    type: 'TOKEN_REFRESHED',
    success: true,
    meta,
  });

  const { user: _user, ...tokens } = session;
  return tokens;
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export async function logout(
  userId: string,
  rawToken: string | undefined,
  allDevices: boolean,
  meta: RequestMeta,
) {
  if (allDevices) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // Bumping tokenVersion kills every live ACCESS token too, not just refresh.
    await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    invalidatePermissionCache(userId);
  } else if (rawToken) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  await recordAuthEvent({ userId, type: 'LOGOUT', success: true, meta });
}

// ---------------------------------------------------------------------------
// Change password
// ---------------------------------------------------------------------------

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

  if (!user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    await recordAuthEvent({
      userId,
      email: user.email,
      type: 'PASSWORD_CHANGED',
      success: false,
      reason: 'current password incorrect',
      meta,
    });
    throw unauthenticated('Current password is incorrect');
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
    type: 'PASSWORD_CHANGED',
    success: true,
    meta,
  });
}

// ---------------------------------------------------------------------------
// Current user
// ---------------------------------------------------------------------------

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
