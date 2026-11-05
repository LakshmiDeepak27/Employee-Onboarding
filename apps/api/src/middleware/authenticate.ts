import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/client.js';
import type { Scope } from '@eo/contracts';
import { env } from '../config/env.js';
import { unauthenticated, forbidden } from '../lib/errors.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { resolvePermissions, type PermissionMap } from '../rbac/permissions.js';

export interface AuthContext {
  userId: string;
  email: string;
  employeeId: string | null;
  roles: string[];
  permissions: PermissionMap;
  /** Set when the request authenticated via DEV_AUTH_BYPASS. */
  isDevBypass: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      requestId: string;
    }
  }
}

function bearerFrom(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Populates req.auth. Rejects the request if the token is missing, malformed,
 * expired, or carries a stale tokenVersion.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    // --- development-only bypass -------------------------------------------
    // Lets the frontend and the six service teams build against real routes
    // before login exists. env.ts refuses to boot with this enabled outside
    // development, so it cannot reach a deployed environment.
    if (env.DEV_AUTH_BYPASS) {
      const devUser = req.header('x-dev-user');
      if (devUser) {
        const user = await prisma.user.findUnique({
          where: { email: devUser.toLowerCase() },
          select: {
            id: true,
            email: true,
            employee: { select: { id: true } },
            userRoles: { select: { role: { select: { key: true } } } },
          },
        });
        if (!user) throw unauthenticated(`x-dev-user "${devUser}" does not exist`);
        req.auth = {
          userId: user.id,
          email: user.email,
          employeeId: user.employee?.id ?? null,
          roles: user.userRoles.map((r) => r.role.key),
          permissions: await resolvePermissions(user.id),
          isDevBypass: true,
        };
        return next();
      }
    }

    const token = bearerFrom(req);
    if (!token) throw unauthenticated('Missing bearer token');

    const claims = verifyAccessToken(token);

    // tokenVersion gives us instant revocation with no blacklist: changing a
    // password or forcing logout bumps the column and every live token dies.
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        email: true,
        status: true,
        tokenVersion: true,
        lockedUntil: true,
        employee: { select: { id: true } },
      },
    });

    if (!user) throw unauthenticated('Account no longer exists');
    if (user.tokenVersion !== claims.tv) {
      throw unauthenticated('Session has been revoked, please sign in again', 'TOKEN_INVALID');
    }
    if (user.status === 'SUSPENDED') throw forbidden('Account is suspended');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw forbidden('Account is temporarily locked');
    }

    req.auth = {
      userId: user.id,
      email: user.email,
      employeeId: user.employee?.id ?? null,
      roles: claims.roles,
      permissions: await resolvePermissions(user.id),
      isDevBypass: false,
    };
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAuth(req: Request): AuthContext {
  if (!req.auth) throw unauthenticated();
  return req.auth;
}

export type { Scope };
