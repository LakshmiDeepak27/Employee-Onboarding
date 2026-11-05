import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Scope } from '@eo/contracts';
import { forbidden, notFound, unauthenticated } from '../lib/errors.js';
import { isEmployeeInScope } from '../rbac/scope.js';
import type { AuthContext } from './authenticate.js';

/**
 * Resolves the employee a request is *about*, so the scope check has a target.
 * Return null when the row does not exist — we then 404 rather than 403, so
 * the response does not confirm the existence of out-of-scope data.
 */
export type TargetResolver = (
  req: Request,
  actor: AuthContext,
) => Promise<string | null> | string | null;

export interface AuthorizeOptions {
  /**
   * How to find the target employee for this request. Omit for endpoints
   * that are not about a specific employee (catalogs, reference data), in
   * which case holding the permission at any scope is sufficient.
   */
  target?: TargetResolver;
  /**
   * Minimum scope required regardless of the target, e.g. force ORG on an
   * organisation-wide report.
   */
  minimumScope?: Scope;
}

/**
 * THE authorization middleware. Two gates, in order:
 *
 *   1. Does the caller hold this permission at all?       -> 403 if not
 *   2. Is the target row within the scope they hold it at? -> 404 if not
 *
 * Step 2 is the part that makes this real RBAC rather than role-name checks.
 * A manager with `plan.read` at REPORTS passes step 1 for every plan in the
 * company and fails step 2 for all but their own reports'.
 */
export function requirePermission(
  permissionKey: string,
  options: AuthorizeOptions = {},
): RequestHandler {
  return async function authorize(req: Request, _res: Response, next: NextFunction) {
    try {
      const actor = req.auth;
      if (!actor) throw unauthenticated();

      const scope = actor.permissions.get(permissionKey);
      if (!scope) {
        throw forbidden(
          `This action requires the "${permissionKey}" permission, which your role does not grant.`,
        );
      }

      if (options.minimumScope) {
        const rank: Record<Scope, number> = { SELF: 0, REPORTS: 1, DEPARTMENT: 2, ORG: 3 };
        if (rank[scope] < rank[options.minimumScope]) {
          throw forbidden(
            `This action requires "${permissionKey}" at ${options.minimumScope} scope; you hold it at ${scope}.`,
          );
        }
      }

      if (options.target) {
        const targetEmployeeId = await options.target(req, actor);
        if (targetEmployeeId === null) throw notFound();

        const allowed = await isEmployeeInScope(actor, scope, targetEmployeeId);
        if (!allowed) {
          // 404, not 403 — see lib/errors.ts.
          throw notFound();
        }
        // Hand the resolved target downstream so handlers need not re-query.
        (req as Request & { targetEmployeeId?: string }).targetEmployeeId = targetEmployeeId;
      }

      next();
    } catch (e) {
      next(e);
    }
  };
}

/**
 * Convenience for endpoints where the employee id is a path parameter.
 *   router.get('/employees/:id', requirePermission('employee.read', byParam('id')))
 */
export function byParam(name: string): TargetResolver {
  return (req) => req.params[name] ?? null;
}

/** For endpoints whose target is the caller's own employee record. */
export const bySelf: TargetResolver = (_req, actor) => actor.employeeId;

/** Guard for a route that only a role-set may touch, ignoring row scope. */
export function requireAnyRole(...roleKeys: string[]): RequestHandler {
  return (req, _res, next) => {
    const actor = req.auth;
    if (!actor) return next(unauthenticated());
    if (!actor.roles.some((r) => roleKeys.includes(r))) {
      return next(forbidden(`Requires one of: ${roleKeys.join(', ')}`));
    }
    next();
  };
}
