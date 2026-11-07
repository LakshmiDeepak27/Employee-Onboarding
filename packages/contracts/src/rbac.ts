import type { z } from "zod";
import type { PermissionScopeEnum, RoleKeyEnum } from "./common.js";

export type RoleKey = z.infer<typeof RoleKeyEnum>;
export type Scope = z.infer<typeof PermissionScopeEnum>;

export interface PermissionDef {
  key: string;
  resource: string;
  action: string;
  description: string;
}
// The permission catalog

function p(
  resource: string,
  action: string,
  description: string,
): PermissionDef {
  return { key: `${resource}.${action}`, resource, action, description };
}

export const PERMISSIONS: readonly PermissionDef[] = [
  p("employee", "read", "View an employee profile"),
  p("employee", "create", "Create a new-hire record"),
  p("employee", "update", "Edit an employee profile"),
  p("employee", "invite", "Invite an employee to the portal"),
  p("plan", "read", "View an onboarding plan, its tasks and citations"),
  p("plan", "generate", "Request AI plan generation for an employee"),
  p("plan", "update", "Edit tasks on a draft plan"),
  p("plan", "approve", "Approve a plan so its tasks may be dispatched"),
  p("plan", "delete", "Delete a draft plan"),
  p("task", "read", "View a plan task"),
  p("task", "update", "Edit a task owner, due date or status"),
  p("task", "complete", "Mark a task complete"),
  p("task", "escalate", "Escalate a task to compliance"),
  p("document", "read", "View document requests and metadata"),
  p("document", "upload", "Upload a document"),
  p("document", "verify", "Verify or reject an uploaded document"),
  p("equipment", "read", "View equipment assignments"),
  p("equipment", "assign", "Order or assign equipment"),
  p("equipment", "receipt", "Acknowledge delivered equipment"),
  p("payroll", "read", "View payroll setup"),
  p("payroll", "write", "Create or edit payroll setup"),
  p("payroll", "verify", "Verify payroll setup before the first run"),
  p("benefit", "read", "View benefit enrolments"),
  p("benefit", "enrol", "Elect or waive a benefit"),
  p("training", "read", "View training assignments"),
  p("training", "assign", "Assign a training course"),
  p("training", "complete", "Record training completion"),
  p("managertask", "read", "View manager setup tasks"),
  p("managertask", "write", "Complete manager setup tasks"),
  p("policy", "read", "Browse the policy corpus and resolve citations"),
  p("policy", "write", "Add or edit policy documents and clauses"),
  p("finding", "read", "View validator findings for a plan"),
  p("escalation", "read", "View escalations"),
  p("escalation", "resolve", "Resolve or dismiss an escalation"),
  p("audit", "read", "Read the audit trail"),
  p("eval", "read", "View evaluation runs and harness metrics"),
  p("user", "read", "List and view user accounts"),
  p("user", "create", "Create a user account"),
  p("user", "update", "Change a user status or reset a password"),
  p("role", "read", "List roles and permissions"),
  p("role", "assign", "Grant or revoke a role"),
] as const;

export const PERMISSION_KEYS = PERMISSIONS.map((x) => x.key);
export type PermissionKey = (typeof PERMISSION_KEYS)[number];
// Roles

export interface RoleDef {
  key: RoleKey;
  name: string;
  description: string;
  isSystem: boolean;
  /** permission key -> scope at which this role holds it */
  grants: Record<string, Scope>;
}

/** Helper: give every listed permission the same scope. */
function at(scope: Scope, ...keys: string[]): Record<string, Scope> {
  return Object.fromEntries(keys.map((k) => [k, scope]));
}

export const ROLES: readonly RoleDef[] = [
  {
    key: "hr_admin",
    name: "HR Admin",
    description:
      "Creates and manages onboarding end to end, across the whole organisation. The ONLY role that can approve a plan, which is the single gate before any task is dispatched.",
    isSystem: false,
    grants: at(
      "ORG",
      // employees
      "employee.read",
      "employee.create",
      "employee.update",
      "employee.invite",
      // plans — note plan.approve is unique to this role
      "plan.read",
      "plan.generate",
      "plan.update",
      "plan.approve",
      "plan.delete",
      // tasks
      "task.read",
      "task.update",
      "task.complete",
      "task.escalate",
      // the six workflow services
      "document.read",
      "document.upload",
      "document.verify",
      "equipment.read",
      "equipment.assign",
      "equipment.receipt",
      "payroll.read",
      "payroll.write",
      "payroll.verify",
      "benefit.read",
      "benefit.enrol",
      "training.read",
      "training.assign",
      "training.complete",
      "managertask.read",
      "managertask.write",
      // knowledge base
      "policy.read",
      "policy.write",
      // harness and governance
      "finding.read",
      "escalation.read",
      "escalation.resolve",
      "audit.read",
      "eval.read",
      // administration
      "user.read",
      "user.create",
      "user.update",
      "role.read",
      "role.assign",
    ),
  },
  {
    key: "it_admin",
    name: "IT Admin",
    description:
      "Owns equipment inventory and fulfillment. Can see equipment work and task context, but never payroll, benefits elections, or confidential employee submissions.",
    isSystem: false,
    grants: at(
      "ORG",
      "employee.read",
      "task.read",
      "equipment.read",
      "equipment.assign",
    ),
  },
  {
    key: "manager",
    name: "Manager",
    description:
      "Completes team-setup tasks and tracks progress for THEIR OWN DIRECT REPORTS only. Cannot approve plans and has no access to payroll data at all.",
    isSystem: false,
    grants: at(
      "REPORTS",
      "employee.read",
      "plan.read",
      "task.read",
      "task.update",
      "task.complete",
      "task.escalate",
      "document.read",
      "equipment.read",
      "benefit.read",
      "training.read",
      "managertask.read",
      "managertask.write",
      "policy.read",
      "finding.read",
    ),
  },
  {
    key: "employee",
    name: "New Employee",
    description:
      "The employee portal. Submits documents and tracks onboarding. Scope SELF on every single grant: this role can never read or touch the record of anybody else.",
    isSystem: false,
    grants: at(
      "SELF",
      "employee.read",
      "plan.read",
      "task.read",
      "task.complete",
      "document.read",
      "document.upload",
      "equipment.receipt",
      "payroll.read",
      "payroll.write",
      "benefit.read",
      "benefit.enrol",
      "training.read",
      "training.complete",
      "policy.read",
    ),
  },
] as const;
// Scope ordering — a wider scope subsumes a narrower one.

export const SCOPE_RANK: Record<Scope, number> = {
  SELF: 0,
  REPORTS: 1,
  DEPARTMENT: 2,
  ORG: 3,
};

export function widestScope(a: Scope, b: Scope): Scope {
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b;
}

/** Sanity check used by a unit test: every grant names a real permission. */
export function validateCatalog(): string[] {
  const known = new Set(PERMISSION_KEYS);
  const problems: string[] = [];
  for (const role of ROLES) {
    for (const key of Object.keys(role.grants)) {
      if (!known.has(key)) {
        problems.push(`role "${role.key}" grants unknown permission "${key}"`);
      }
    }
  }
  return problems;
}
