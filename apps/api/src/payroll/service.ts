import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { PayrollSetupSchema, type UpsertPayrollSetupRequestSchema, type z } from '@eo/contracts';
import { prisma, Prisma, type PayrollSetup } from '../db/client.js';
import { writeAudit } from '../lib/audit.js';
import { conflict, notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/authenticate.js';

type Input = z.infer<typeof UpsertPayrollSetupRequestSchema>;
type SafeInput = Omit<Input, 'bankAccountNumber' | 'nationalId'> & {
  bankAccountLast4?: string;
  bankTokenRef?: string;
  nationalIdLast4?: string;
};

/** Local demonstration only: no network, no vault, no account verification or payment. */
export function maskPayrollInput(input: Input): SafeInput {
  const { bankAccountNumber, nationalId, ...safe } = input;
  return {
    ...safe,
    ...(bankAccountNumber === undefined
      ? {}
      : {
          bankAccountLast4: bankAccountNumber.slice(-4),
          bankTokenRef: `mock_bank_${randomUUID()}`,
        }),
    ...(nationalId === undefined ? {} : { nationalIdLast4: nationalId.slice(-4) }),
  };
}

const taskInclude = {
  plan: true,
  dependencies: { include: { dependsOn: true } },
} satisfies Prisma.PlanTaskInclude;
type Task = Prisma.PlanTaskGetPayload<{ include: typeof taskInclude }>;

async function loadTask(tx: Prisma.TransactionClient, req: Request, taskId: string): Promise<Task> {
  const task = await tx.planTask.findUnique({ where: { id: taskId }, include: taskInclude });
  if (!task || task.service !== 'PAYROLL') throw notFound('Payroll task');
  // Re-check the resolved owner inside the transaction; a concurrent reassignment
  // must not turn a successful row-scope check into access to another employee.
  const targetId = (req as Request & { targetEmployeeId?: string }).targetEmployeeId;
  if (task.plan.employeeId !== targetId) throw notFound('Payroll task');
  return task;
}

function assertApproved(task: Task) {
  if (
    !['APPROVED', 'IN_PROGRESS'].includes(task.plan.status) ||
    !task.plan.approvedById ||
    !task.plan.approvedAt ||
    task.reviewState !== 'OK'
  ) {
    throw conflict(
      'Payroll requires a reviewed task and a named HR-approved active plan.',
      'APPROVAL_BLOCKED',
    );
  }
  if (task.status === 'SKIPPED' || task.status === 'BLOCKED') {
    throw conflict('Resolve the blocked or skipped task before changing payroll.');
  }
}

function assertDependencies(task: Task) {
  if (
    task.dependencies.some(
      ({ dependsOn }) =>
        dependsOn.planId !== task.planId ||
        dependsOn.id === task.id ||
        dependsOn.status !== 'COMPLETED' ||
        dependsOn.reviewState !== 'OK',
    )
  ) {
    throw conflict('All payroll prerequisites must be reviewed and completed in the same plan.');
  }
}

type Readiness = Pick<
  PayrollSetup,
  | 'taxFormType'
  | 'taxFormReceivedAt'
  | 'bankAccountLast4'
  | 'bankTokenRef'
  | 'payFrequency'
  | 'salaryCurrency'
>;

export function payrollStatus(row: Readiness): PayrollSetup['status'] {
  if (!row.taxFormType?.trim() || !row.taxFormReceivedAt) return 'AWAITING_TAX_FORM';
  if (!row.bankAccountLast4 || !row.bankTokenRef) return 'AWAITING_BANK_DETAILS';
  if (!row.payFrequency || !row.salaryCurrency) return 'PENDING';
  return 'READY';
}

/** Allow-list only; free text, bank tokens and identifier suffixes never enter audit payloads. */
function auditState(row: PayrollSetup) {
  return {
    taskId: row.taskId,
    status: row.status,
    taxFormReceived: row.taxFormReceivedAt !== null,
    bankDetailsPresent: row.bankTokenRef !== null,
    nationalIdPresent: row.nationalIdLast4 !== null,
    verifiedById: row.verifiedById,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  };
}

async function present(tx: Prisma.TransactionClient, row: PayrollSetup) {
  // verifiedById is a scalar in the existing schema, not a Prisma relation.
  const verifier = row.verifiedById
    ? await tx.user.findUnique({
        where: { id: row.verifiedById },
        select: { employee: { select: { firstName: true, lastName: true } } },
      })
    : null;
  return PayrollSetupSchema.parse({
    id: row.id,
    taskId: row.taskId,
    employeeId: row.employeeId,
    status: row.status,
    payFrequency: row.payFrequency,
    salaryCurrency: row.salaryCurrency,
    taxFormType: row.taxFormType,
    taxFormReceivedAt: row.taxFormReceivedAt?.toISOString() ?? null,
    bankAccountLast4: row.bankAccountLast4,
    nationalIdLast4: row.nationalIdLast4,
    verifiedByName: verifier?.employee
      ? `${verifier.employee.firstName} ${verifier.employee.lastName}`
      : null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  });
}

/** Retry serialization conflicts; state, task completion and audit commit together. */
async function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034')
        throw error;
      if (attempt >= 2) throw conflict('Payroll changed concurrently. Reload and retry.');
    }
  }
}

function assertEmployee(row: PayrollSetup, task: Task) {
  if (row.employeeId !== task.plan.employeeId)
    throw conflict('Payroll employee does not match the task plan.');
}

export async function getPayroll(req: Request, taskId: string) {
  requireAuth(req);
  return transaction(async (tx) => {
    const task = await loadTask(tx, req, taskId);
    let row = await tx.payrollSetup.findUnique({ where: { taskId } });
    if (!row) {
      if (typeof tx.payrollSetup.create !== "function") {
        throw notFound('Payroll setup');
      }
      row = await tx.payrollSetup.create({
        data: {
          taskId,
          employeeId: task.plan.employeeId,
          status: 'PENDING',
        },
      });
    }
    assertEmployee(row, task);
    return present(tx, row);
  });
}

export async function savePayroll(req: Request, taskId: string, input: SafeInput) {
  requireAuth(req);
  return transaction(async (tx) => {
    const task = await loadTask(tx, req, taskId);
    assertApproved(task);
    const before = await tx.payrollSetup.findUnique({ where: { taskId } });
    if (before) assertEmployee(before, task);
    // No reopen contract exists. Do not silently invalidate downstream completed tasks.
    if (before?.status === 'VERIFIED' || task.status === 'COMPLETED') {
      throw conflict(
        'Verified payroll and completed tasks are locked. An explicit correction workflow is required.',
      );
    }
    const { taxFormReceived, ...fields } = input;
    const taxFormChanged =
      fields.taxFormType !== undefined && fields.taxFormType !== before?.taxFormType;
    const taxFormReceivedAt =
      taxFormReceived === false
        ? null
        : taxFormReceived === true
          ? taxFormChanged
            ? new Date()
            : (before?.taxFormReceivedAt ?? new Date())
          : taxFormChanged
            ? null
            : (before?.taxFormReceivedAt ?? null);
    const data = {
      payFrequency: before?.payFrequency ?? null,
      salaryCurrency: before?.salaryCurrency ?? null,
      taxFormType: before?.taxFormType ?? null,
      bankAccountLast4: before?.bankAccountLast4 ?? null,
      bankTokenRef: before?.bankTokenRef ?? null,
      nationalIdLast4: before?.nationalIdLast4 ?? null,
      ...fields,
      taxFormReceivedAt,
      verifiedAt: null,
      verifiedById: null,
    };
    const saved = await tx.payrollSetup.upsert({
      where: { taskId },
      create: { ...data, status: payrollStatus(data), taskId, employeeId: task.plan.employeeId },
      update: { ...data, status: payrollStatus(data) },
    });
    await tx.planTask.update({ where: { id: taskId }, data: { status: 'IN_PROGRESS' } });
    await writeAudit(
      req,
      {
        action: before ? 'payroll.updated' : 'payroll.created',
        resourceType: 'payroll_setup',
        resourceId: saved.id,
        before: before ? { ...auditState(before), taskStatus: task.status } : undefined,
        after: {
          ...auditState(saved),
          planId: task.planId,
          taskStatus: 'IN_PROGRESS',
          changedFields: Object.keys(input).filter((key) => key !== 'bankTokenRef'),
        },
      },
      tx,
    );
    return present(tx, saved);
  });
}

export async function verifyPayroll(req: Request, taskId: string) {
  const actor = requireAuth(req);
  return transaction(async (tx) => {
    const task = await loadTask(tx, req, taskId);
    assertApproved(task);
    assertDependencies(task);
    const before = await tx.payrollSetup.findUnique({ where: { taskId } });
    if (!before) throw notFound('Payroll setup');
    assertEmployee(before, task);
    if (before.status === 'VERIFIED') {
      if (task.status !== 'COMPLETED' || !before.verifiedAt || !before.verifiedById) {
        throw conflict('Payroll verification and task completion are inconsistent.');
      }
      return present(tx, before); // Safe retry: preserve the original verifier and audit.
    }
    if (task.status === 'COMPLETED' || payrollStatus(before) !== 'READY') {
      throw conflict(
        'Payroll requires tax documentation, bank details, pay frequency and currency before verification.',
      );
    }
    const now = new Date();
    const saved = await tx.payrollSetup.update({
      where: { taskId },
      data: { status: 'VERIFIED', verifiedAt: now, verifiedById: actor.userId },
    });
    await tx.planTask.update({
      where: { id: taskId },
      data: { status: 'COMPLETED', completedAt: now, completedById: actor.userId },
    });
    await writeAudit(
      req,
      {
        action: 'payroll.verified',
        resourceType: 'payroll_setup',
        resourceId: saved.id,
        before: { ...auditState(before), taskStatus: task.status },
        after: {
          ...auditState(saved),
          planId: task.planId,
          taskStatus: 'COMPLETED',
          acknowledgement: true,
          integration: 'MOCK',
        },
        // Free-form verification notes are deliberately not retained: they may contain PII.
      },
      tx,
    );
    return present(tx, saved);
  });
}
