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
  it('grants payroll only to HR admin in the current catalog', () => {
    for (const role of ROLES) {
      expect(Object.keys(role.grants).filter((key) => key.startsWith('payroll.')).length).toBe(
        role.key === 'hr_admin' ? 3 : 0,
      );
    }
  });
});
