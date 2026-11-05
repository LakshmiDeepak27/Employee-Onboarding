import { prisma } from '../db/client.js';
import type { Scope } from '@eo/contracts';
import type { AuthContext } from '../middleware/authenticate.js';

/**
 * SCOPE ENFORCEMENT.
 *
 * A permission alone is not authorization. `plan.read` at scope REPORTS means
 * "may read plans, but only for my own direct reports". This module answers
 * the only question that matters: given this actor and this target employee,
 * is the row in scope?
 *
 * Everything here runs against the database on the real target row. Nothing
 * is inferred from the JWT, so a forged or stale token cannot widen scope.
 */

/** The set of employee ids an actor may touch at a given scope. */
export async function employeeIdsInScope(
  actor: AuthContext,
  scope: Scope,
): Promise<{ all: true } | { all: false; ids: string[] }> {
  if (scope === 'ORG') return { all: true };

  if (!actor.employeeId) {
    // A user with no employee record (e.g. a bare admin account) has no SELF,
    // REPORTS or DEPARTMENT reach at all.
    return { all: false, ids: [] };
  }

  if (scope === 'SELF') return { all: false, ids: [actor.employeeId] };

  if (scope === 'REPORTS') {
    const reports = await prisma.employee.findMany({
      where: { managerId: actor.employeeId },
      select: { id: true },
    });
    // A manager can always see their own record too.
    return { all: false, ids: [actor.employeeId, ...reports.map((r) => r.id)] };
  }

  // DEPARTMENT
  const me = await prisma.employee.findUnique({
    where: { id: actor.employeeId },
    select: { departmentId: true },
  });
  if (!me?.departmentId) return { all: false, ids: [actor.employeeId] };

  const peers = await prisma.employee.findMany({
    where: { departmentId: me.departmentId },
    select: { id: true },
  });
  return { all: false, ids: peers.map((p) => p.id) };
}

/** True when `targetEmployeeId` is reachable by the actor at `scope`. */
export async function isEmployeeInScope(
  actor: AuthContext,
  scope: Scope,
  targetEmployeeId: string,
): Promise<boolean> {
  const reach = await employeeIdsInScope(actor, scope);
  if (reach.all) return true;
  return reach.ids.includes(targetEmployeeId);
}

/**
 * Turns a scope into a Prisma `where` fragment on an employee id column.
 * Use this on LIST endpoints so scoping happens in SQL rather than by
 * filtering a full result set in memory.
 */
export async function employeeScopeFilter(
  actor: AuthContext,
  scope: Scope,
  column: string = 'employeeId',
): Promise<Record<string, unknown>> {
  const reach = await employeeIdsInScope(actor, scope);
  if (reach.all) return {};
  return { [column]: { in: reach.ids } };
}

// ---------------------------------------------------------------------------
// Resolvers: given a resource id, which employee does this row belong to?
// Used by requirePermission() to scope-check a single row.
// ---------------------------------------------------------------------------

export async function employeeIdForPlan(planId: string): Promise<string | null> {
  const plan = await prisma.onboardingPlan.findUnique({
    where: { id: planId },
    select: { employeeId: true },
  });
  return plan?.employeeId ?? null;
}

export async function employeeIdForTask(taskId: string): Promise<string | null> {
  const task = await prisma.planTask.findUnique({
    where: { id: taskId },
    select: { plan: { select: { employeeId: true } } },
  });
  return task?.plan.employeeId ?? null;
}

export async function employeeIdForDocument(documentId: string): Promise<string | null> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { employeeId: true },
  });
  return doc?.employeeId ?? null;
}
