import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Prisma, type PayrollSetup } from '@prisma/client';
import { PayrollSetupSchema, ROLES, type Scope } from '@eo/contracts';

const db = vi.hoisted(() => ({
  planTask: { findUnique: vi.fn(), update: vi.fn() },
  payrollSetup: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
  userRole: { findMany: vi.fn() },
  auditEvent: { create: vi.fn() },
  $transaction: vi.fn(),
}));
const log = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), child: vi.fn() }));
vi.mock('../src/db/client.js', async () => ({
  ...(await import('@prisma/client')),
  prisma: db,
  isDatabaseOnline: () => true,
  setDatabaseOnline: vi.fn(),
  checkDatabaseConnection: vi.fn().mockResolvedValue(true),
}));
vi.mock('../src/lib/logger.js', () => ({ logger: log }));
vi.mock('../src/config/env.js', () => ({ env: { DEV_AUTH_BYPASS: false }, isProd: true }));
// Token cryptography belongs to auth's own tests; authentication and RBAC middleware remain real here.
vi.mock('../src/auth/tokens.js', () => ({
  verifyAccessToken: () => ({
    sub: '00000000-0000-4000-8000-000000000001',
    tv: 0,
    roles: ['hr_admin'],
  }),
}));

import { payrollRouter } from '../src/routes/payroll.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { requestId } from '../src/middleware/requestId.js';
import { invalidatePermissionCache } from '../src/rbac/permissions.js';

const taskId = '00000000-0000-4000-8000-000000000002';
const employeeId = '00000000-0000-4000-8000-000000000003';
const userId = '00000000-0000-4000-8000-000000000001';
const planId = '00000000-0000-4000-8000-000000000004';
const base = `/api/v1/tasks/${taskId}/payroll`;
const input = {
  payFrequency: 'MONTHLY',
  salaryCurrency: 'cad',
  taxFormType: 'TD1',
  taxFormReceived: true,
  bankAccountNumber: '000000123456',
  nationalId: 'DEMO-ABC9876',
};
const now = new Date('2026-11-06T12:00:00Z');
const makeTask = () => ({
  id: taskId,
  planId,
  service: 'PAYROLL',
  taskType: 'PAYROLL_PROFILE_SETUP',
  reviewState: 'OK',
  status: 'NOT_STARTED',
  completedAt: null as Date | null,
  completedById: null as string | null,
  plan: {
    employeeId,
    status: 'APPROVED',
    approvedById: userId as string | null,
    approvedAt: now as Date | null,
  },
  dependencies: [{ dependsOn: { id: 'tax-task', planId, status: 'COMPLETED', reviewState: 'OK' } }],
});
let task: ReturnType<typeof makeTask>;
let row: PayrollSetup | null;
let grants: { key: string; scope: Scope }[];
const app = express();
app.use(express.json(), requestId);
app.use('/api/v1', payrollRouter);
app.use(errorHandler);
const put = (body: object = input) =>
  request(app).put(base).auth('fixture', { type: 'bearer' }).send(body);
const verify = (body: object = { acknowledgement: true }) =>
  request(app).post(`${base}/verification`).auth('fixture', { type: 'bearer' }).send(body);
const get = () => request(app).get(base).auth('fixture', { type: 'bearer' });

beforeEach(() => {
  vi.resetAllMocks();
  invalidatePermissionCache();
  log.child.mockReturnValue(log);
  task = makeTask();
  row = null;
  grants = Object.entries(ROLES.find((role) => role.key === 'hr_admin')!.grants).map(
    ([key, scope]) => ({ key, scope }),
  );
  db.user.findUnique.mockResolvedValue({
    id: userId,
    email: 'test@example.invalid',
    status: 'ACTIVE',
    tokenVersion: 0,
    lockedUntil: null,
    employee: { id: employeeId, firstName: 'Test', lastName: 'Verifier' },
  });
  db.userRole.findMany.mockImplementation(async () => [
    { role: { rolePermissions: grants.map(({ key, scope }) => ({ scope, permission: { key } })) } },
  ]);
  db.planTask.findUnique.mockImplementation(async () => task);
  db.planTask.update.mockImplementation(async ({ data }) => Object.assign(task, data));
  db.payrollSetup.findUnique.mockImplementation(async () => row);
  db.payrollSetup.upsert.mockImplementation(async ({ create, update }) => {
    row = row
      ? { ...row, ...update }
      : {
          id: '00000000-0000-4000-8000-000000000005',
          createdAt: now,
          updatedAt: now,
          ...create,
        };
    return row;
  });
  db.payrollSetup.update.mockImplementation(async ({ data }) => {
    row = { ...row!, ...data };
    return row;
  });
  db.auditEvent.create.mockResolvedValue({});
  // No real database is imported or contacted. This fake provides rollback for HTTP failure tests.
  db.$transaction.mockImplementation(async (work) => {
    const snapshot = structuredClone({ task, row });
    try {
      return await work(db);
    } catch (error) {
      task = snapshot.task;
      row = snapshot.row;
      throw error;
    }
  });
});

describe('payroll HTTP contract and workflow (isolated Prisma fake)', () => {
  it('rejects unauthenticated requests before looking up payroll', async () => {
    expect((await request(app).get(base)).status).toBe(401);
    expect(db.planTask.findUnique).not.toHaveBeenCalled();
  });

  it.each(['manager', 'employee'])(
    'denies every endpoint to %s, even if JWT role says admin',
    async (role) => {
      grants = Object.entries(ROLES.find((entry) => entry.key === role)!.grants).map(
        ([key, scope]) => ({ key, scope }),
      );
      expect((await get()).status).toBe(403);
      expect((await put()).status).toBe(403);
      expect((await verify()).status).toBe(403);
      expect(db.planTask.findUnique).not.toHaveBeenCalled();
    },
  );

  it('enforces each operation permission independently', async () => {
    grants = [{ key: 'payroll.read', scope: 'ORG' }];
    expect((await put()).status).toBe(403);
    expect((await verify()).status).toBe(403);
  });

  it('hides an out-of-scope row with 404', async () => {
    grants = [{ key: 'payroll.read', scope: 'SELF' }];
    task.plan.employeeId = '00000000-0000-4000-8000-000000000099';
    expect((await get()).status).toBe(404);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rechecks ownership when a task changes employee after the scope lookup', async () => {
    db.planTask.findUnique.mockResolvedValueOnce(structuredClone(task));
    task.plan.employeeId = '00000000-0000-4000-8000-000000000099';
    expect((await put()).status).toBe(404);
    expect(db.payrollSetup.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 for absent task, wrong service and absent payroll detail', async () => {
    db.planTask.findUnique.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(404);
    task.service = 'EQUIPMENT';
    expect((await put()).status).toBe(404);
    task.service = 'PAYROLL';
    expect((await get()).status).toBe(404);
    expect((await verify()).status).toBe(404);
  });

  it('validates UUID before a database UUID query', async () => {
    expect(
      (await request(app).get('/api/v1/tasks/nope/payroll').auth('fixture', { type: 'bearer' }))
        .status,
    ).toBe(400);
    expect(db.planTask.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { bankAccountNumber: '123' },
    { nationalId: '1234' },
    { salaryCurrency: '1$!' },
    { taxFormType: '  ' },
    { payFrequency: 'DAILY' },
    { taxFormReceived: 'true' },
    { status: 'VERIFIED', employeeId: 'forged' },
  ])('rejects invalid input %j without persistence', async (bad) => {
    const response = await put(bad);
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      requestId: expect.any(String),
    });
    expect(db.payrollSetup.upsert).not.toHaveBeenCalled();
  });

  it.each(['DRAFT', 'AWAITING_APPROVAL', 'REFUSED', 'COMPLETED'])(
    'blocks writes in plan state %s',
    async (status) => {
      task.plan.status = status;
      expect((await put()).body.error.code).toBe('APPROVAL_BLOCKED');
      expect((await verify()).status).toBe(409);
      expect(db.auditEvent.create).not.toHaveBeenCalled();
    },
  );

  it.each(['approvedById', 'approvedAt'] as const)(
    'requires named approval field %s',
    async (field) => {
      task.plan[field] = null;
      expect((await put()).status).toBe(409);
    },
  );

  it.each(['NEEDS_REVIEW', 'ESCALATED', 'REJECTED'])(
    'blocks unreviewed payroll: %s',
    async (state) => {
      task.reviewState = state;
      expect((await put()).status).toBe(409);
    },
  );

  it.each(['SKIPPED', 'BLOCKED', 'COMPLETED'])(
    'does not overwrite task status %s',
    async (state) => {
      task.status = state;
      expect((await put()).status).toBe(409);
      expect(db.planTask.update).not.toHaveBeenCalled();
    },
  );

  it('saves suffixes, opaque mock metadata and a contract-valid response; never raw identifiers', async () => {
    const response = await put({ ...input, employeeId: 'forged', status: 'VERIFIED' });
    expect(response.status).toBe(200);
    expect(PayrollSetupSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toMatchObject({
      status: 'READY',
      salaryCurrency: 'CAD',
      bankAccountLast4: '3456',
      nationalIdLast4: '9876',
      employeeId,
    });
    expect(response.body).not.toHaveProperty('bankTokenRef');
    expect(row!.bankTokenRef).toMatch(/^mock_bank_/);
    const serialized = JSON.stringify([
      db.payrollSetup.upsert.mock.calls,
      db.auditEvent.create.mock.calls,
      response.body,
      log.error.mock.calls,
    ]);
    expect(serialized).not.toContain(input.bankAccountNumber);
    expect(serialized).not.toContain(input.nationalId);
    expect(JSON.stringify(db.auditEvent.create.mock.calls)).not.toContain('3456');
    expect(task.status).toBe('IN_PROGRESS');
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('advances through missing tax, missing bank, missing pay settings and ready', async () => {
    expect((await put({ nationalId: input.nationalId })).body.status).toBe('AWAITING_TAX_FORM');
    expect((await verify()).status).toBe(409);
    expect((await put({ taxFormType: 'TD1', taxFormReceived: true })).body.status).toBe(
      'AWAITING_BANK_DETAILS',
    );
    expect((await verify()).status).toBe(409);
    expect((await put({ bankAccountNumber: input.bankAccountNumber })).body.status).toBe('PENDING');
    expect((await verify()).status).toBe(409);
    expect((await put({ payFrequency: 'MONTHLY', salaryCurrency: 'CAD' })).body.status).toBe(
      'READY',
    );
  });

  it('preserves omitted fields and receipt timestamp, but resets changed or withdrawn tax documentation', async () => {
    await put();
    const received = row!.taxFormReceivedAt;
    const token = row!.bankTokenRef;
    await put({ payFrequency: 'WEEKLY', taxFormReceived: true });
    expect(row!.taxFormReceivedAt).toEqual(received);
    expect(row!.bankTokenRef).toBe(token);
    expect((await put({ taxFormType: 'P45' })).body.status).toBe('AWAITING_TAX_FORM');
    expect(row!.taxFormReceivedAt).toBeNull();
    await put({ taxFormReceived: true });
    expect((await put({ taxFormReceived: false })).body.status).toBe('AWAITING_TAX_FORM');
  });

  it.each([{}, { acknowledgement: false }])(
    'requires explicit acknowledgement %j',
    async (body) => {
      await put();
      expect((await verify(body)).status).toBe(400);
      expect(row!.status).toBe('READY');
    },
  );

  it.each(['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'SKIPPED'])(
    'blocks incomplete dependency %s even when details are ready',
    async (status) => {
      task.dependencies[0]!.dependsOn.status = status;
      expect((await put()).status).toBe(200); // Preparation can proceed; completion cannot.
      expect((await verify()).status).toBe(409);
      expect(task.status).toBe('IN_PROGRESS');
    },
  );

  it('blocks cross-plan and rejected dependencies', async () => {
    await put();
    task.dependencies[0]!.dependsOn.planId = 'another-plan';
    expect((await verify()).status).toBe(409);
    task.dependencies[0]!.dependsOn.planId = planId;
    task.dependencies[0]!.dependsOn.reviewState = 'REJECTED';
    expect((await verify()).status).toBe(409);
  });

  it('verifies atomically, records actor, completes only its task and safely retries', async () => {
    await put();
    const response = await verify({ acknowledgement: true, notes: input.bankAccountNumber });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'VERIFIED', verifiedByName: 'Test Verifier' });
    expect(PayrollSetupSchema.safeParse(response.body).success).toBe(true);
    expect(task).toMatchObject({
      status: 'COMPLETED',
      completedById: userId,
      completedAt: row!.verifiedAt,
    });
    expect(db.auditEvent.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'payroll.verified',
          actorUserId: userId,
          requestId: expect.any(String),
        }),
      }),
    );
    expect(JSON.stringify(db.auditEvent.create.mock.calls)).not.toContain(input.bankAccountNumber);
    const auditCount = db.auditEvent.create.mock.calls.length;
    expect((await verify()).body).toEqual(response.body);
    expect(db.auditEvent.create).toHaveBeenCalledTimes(auditCount);
    expect((await put({ salaryCurrency: 'USD' })).status).toBe(409);
    expect((await get()).body).toEqual(response.body);
  });

  it('refuses corrupted employee links before returning or changing payroll', async () => {
    await put();
    row!.employeeId = '00000000-0000-4000-8000-000000000099';
    expect((await get()).status).toBe(409);
    expect((await put()).status).toBe(409);
    expect((await verify()).status).toBe(409);
  });

  it('recomputes readiness instead of trusting a stored READY label', async () => {
    await put();
    row!.bankTokenRef = null;
    expect((await verify()).status).toBe(409);
    expect(task.status).toBe('IN_PROGRESS');
  });

  it('does not conceal inconsistent verification and task completion on retry', async () => {
    await put();
    await verify();
    task.status = 'IN_PROGRESS';
    expect((await verify()).status).toBe(409);
  });

  it('rolls back detail creation when its audit fails', async () => {
    db.auditEvent.create.mockRejectedValueOnce(new Error('audit unavailable'));
    expect((await put()).status).toBe(500);
    expect(row).toBeNull();
    expect(task.status).toBe('NOT_STARTED');
  });

  it('does not return success if audit fails and requests rollback of the complete transaction', async () => {
    await put();
    db.auditEvent.create.mockRejectedValueOnce(new Error('audit unavailable'));
    expect((await verify()).status).toBe(500);
    expect(row!.status).toBe('READY');
    expect(task.status).toBe('IN_PROGRESS');
  });

  it('retries serialization failures and reports exhausted retries as a conflict', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('retry', {
      code: 'P2034',
      clientVersion: 'test',
    });
    db.$transaction.mockRejectedValueOnce(error);
    expect((await put()).status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    db.$transaction.mockRejectedValue(error);
    expect((await verify()).status).toBe(409);
    expect(db.$transaction).toHaveBeenCalledTimes(5);
  });
});
