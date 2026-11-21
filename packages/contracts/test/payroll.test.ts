import { describe, expect, it } from 'vitest';
import { UpsertPayrollSetupRequestSchema, VerifyPayrollRequestSchema } from '../src/services.js';
import { ROLES } from '../src/rbac.js';

describe('shared payroll contract', () => {
  it('normalizes currency and tax form without allowing unknown fields to set workflow state', () => {
    expect(
      UpsertPayrollSetupRequestSchema.parse({
        salaryCurrency: 'cad',
        taxFormType: ' TD1 ',
        status: 'VERIFIED',
      }),
    ).toEqual({ salaryCurrency: 'CAD', taxFormType: 'TD1' });
  });
  it('does not allow an entire four-character national ID to become the stored suffix', () => {
    expect(UpsertPayrollSetupRequestSchema.safeParse({ nationalId: '1234' }).success).toBe(false);
  });
  it('requires true acknowledgement for pay-affecting verification', () => {
    expect(VerifyPayrollRequestSchema.safeParse({ acknowledgement: false }).success).toBe(false);
    expect(VerifyPayrollRequestSchema.safeParse({ acknowledgement: true }).success).toBe(true);
  });
  it('grants payroll verification only to HR admin, with self-service payroll input for employees', () => {
    for (const role of ROLES) {
      if (role.key === 'hr_admin') {
        expect(Object.keys(role.grants).filter((key) => key.startsWith('payroll.')).length).toBe(3);
        expect(role.grants['payroll.verify']).toBeDefined();
      } else if (role.key === 'employee') {
        expect(Object.keys(role.grants).filter((key) => key.startsWith('payroll.')).length).toBe(2);
        expect(role.grants['payroll.verify']).toBeUndefined();
      } else {
        expect(Object.keys(role.grants).filter((key) => key.startsWith('payroll.')).length).toBe(0);
      }
    }
  });
});
