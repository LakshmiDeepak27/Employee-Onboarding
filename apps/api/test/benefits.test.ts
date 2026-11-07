import { describe, it, expect, beforeEach } from 'vitest';
import { BenefitsService } from '../src/services/benefits/benefits-service';
import { BenefitsAgent, WorkerContext } from '../src/services/benefits/benefits-agent';
import { computeEnrolmentWindow, checkBenefitsEligibility, computePayrollImpact } from '../src/services/benefits/benefits-rules';
import { ElectBenefitRequestSchema } from '@eo/contracts';

describe('Tier 1: Unit Tests - Deterministic Rules & Deadlines (V6)', () => {
  it('should compute exact 31-day statutory enrolment window for CA-ON', () => {
    const startDate = '2026-12-01';
    const window = computeEnrolmentWindow(startDate, 'CA-ON', new Date('2026-12-01'));

    expect(window.windowStart).toBe('2026-12-01');
    expect(window.windowEnd).toBe('2027-01-01');
    expect(window.daysRemaining).toBe(31);
    expect(window.isAtRisk).toBe(false);
    expect(window.isExpired).toBe(false);
  });

  it('should flag isAtRisk when remaining window is <= 5 days', () => {
    const startDate = '2026-12-01';
    // Current date is 28 days later (3 days remaining before 31-day deadline)
    const currentDate = new Date('2026-12-29');
    const window = computeEnrolmentWindow(startDate, 'CA-ON', currentDate);

    expect(window.daysRemaining).toBeLessThanOrEqual(5);
    expect(window.isAtRisk).toBe(true);
    expect(window.riskReason).toContain('Statutory enrolment window expires in');
  });

  it('should flag expired window when past the deadline', () => {
    const startDate = '2026-10-01';
    const currentDate = new Date('2026-11-06'); // 36 days later
    const window = computeEnrolmentWindow(startDate, 'CA-ON', currentDate);

    expect(window.isExpired).toBe(true);
    expect(window.isAtRisk).toBe(true);
    expect(window.riskReason).toContain('Enrolment window closed');
  });

  it('should compute pre-tax payroll deduction and annual tax savings', () => {
    const impact = computePayrollImpact(100.0, true, 0.30);
    expect(impact.monthlyEmployeeCost).toBe(100.0);
    expect(impact.annualDeduction).toBe(1200.0);
    expect(impact.estimatedAnnualTaxSavings).toBe(360.0);
    expect(impact.netMonthlyCost).toBe(70.0);
  });

  it('should refuse benefits for independent contractors (Hire C)', () => {
    const check = checkBenefitsEligibility('CA-ON', 'CONTRACTOR');
    expect(check.isEligible).toBe(false);
    expect(check.refusalCode).toBe('CONTRACTOR_INELIGIBLE');
  });

  it('should refuse benefits for unsupported jurisdiction', () => {
    const check = checkBenefitsEligibility('SG', 'FULL_TIME');
    expect(check.isEligible).toBe(false);
    expect(check.refusalCode).toBe('UNSUPPORTED_JURISDICTION');
  });
});

describe('Tier 2: Benefits AI Agent - Grounding, Citations & Harness', () => {
  let agent: BenefitsAgent;

  beforeEach(() => {
    agent = new BenefitsAgent(undefined, 'gemini-1.5-flash'); // Runs in BASELINE_FALLBACK mode without API key
  });

  it('should refuse plan generation for contractor in Singapore (Hire C)', async () => {
    const contractor: WorkerContext = {
      id: 'worker-c',
      fullName: 'Alex Tan',
      jurisdictionCode: 'SG',
      employmentType: 'CONTRACTOR',
      roleFamily: 'consulting',
      startDate: '2026-11-20',
      workMode: 'REMOTE',
    };

    const result = await agent.generateAdvice(contractor, [], {
      coveragePreference: 'STANDARD',
      familyStatus: 'SINGLE',
      dependentsCount: 0,
    });

    expect(result.status).toBe('REFUSED');
    expect(result.findings.some((f) => f.code === 'CONTRACTOR_INELIGIBLE')).toBe(true);
  });

  it('should produce grounded advice for CA-ON employee with citations and composite confidence', async () => {
    const employee: WorkerContext = {
      id: 'worker-priya',
      fullName: 'Priya Nair',
      jurisdictionCode: 'CA-ON',
      employmentType: 'FULL_TIME',
      roleFamily: 'engineering',
      startDate: '2026-12-01',
      workMode: 'HYBRID',
    };

    const service = new BenefitsService();
    const plans = (await service.getPlans('CA-ON')).items;

    const result = await agent.generateAdvice(employee, plans, {
      coveragePreference: 'STANDARD',
      familyStatus: 'COUPLE',
      dependentsCount: 1,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.advice).toBeDefined();
    expect(result.advice?.recommendedTier).toBe('EMPLOYEE_PLUS_SPOUSE');
    expect(result.advice?.citations.length).toBeGreaterThan(0);

    // Verify citations belong to CA-ON
    for (const citation of result.advice!.citations) {
      expect(citation.clauseId.startsWith('CA-ON')).toBe(true);
      expect(citation.isMock).toBe(true);
    }

    // Verify composite confidence is computed from 5 signals
    const cb = result.advice!.confidenceBreakdown;
    expect(cb.citationQuoteMatch).toBeGreaterThan(0);
    expect(cb.retrievalScore).toBeGreaterThan(0);
    expect(cb.templateCorroboration).toBeGreaterThan(0);
    expect(cb.validatorCleanRate).toBeGreaterThan(0);
    expect(cb.schemaFirstPass).toBeGreaterThan(0);
  });
});

describe('Tier 3: Benefits Service - Election, Waiver, and Authority Guard (V7)', () => {
  let service: BenefitsService;
  const priyaWorker: WorkerContext = {
    id: 'worker-priya-ca',
    fullName: 'Priya Nair',
    jurisdictionCode: 'CA-ON',
    employmentType: 'FULL_TIME',
    roleFamily: 'engineering',
    startDate: '2026-12-01',
    workMode: 'HYBRID',
  };

  beforeEach(() => {
    service = new BenefitsService();
  });

  it('should initialize enrollment record with countdown and window', async () => {
    const enrollment = await service.getEnrollmentForTask('task-101', priyaWorker);
    expect(enrollment.taskId).toBe('task-101');
    expect(enrollment.jurisdictionCode).toBe('CA-ON');
    expect(enrollment.status).toBe('NOT_STARTED');
    expect(enrollment.enrolmentWindowEnd).toBe('2027-01-01');
  });

  it('should successfully elect benefit plan with spouse tier and write audit event', async () => {
    const plans = (await service.getPlans('CA-ON')).items;
    const healthPlan = plans.find((p) => p.category === 'HEALTH')!;

    const result = await service.electOrWaive('task-101', priyaWorker, {
      action: 'ELECT',
      planId: healthPlan.id,
      coverageTier: 'EMPLOYEE_PLUS_SPOUSE',
      dependents: [
        {
          fullName: 'Arjun Nair',
          relationship: 'SPOUSE',
          dateOfBirth: '1992-05-14',
        },
      ],
      preTaxDeductionAcknowledged: true,
      actor: 'priya@demo.io',
    });

    expect(result.enrollment.status).toBe('ELECTED');
    expect(result.enrollment.electedPlanId).toBe(healthPlan.id);
    expect(result.enrollment.coverageTier).toBe('EMPLOYEE_PLUS_SPOUSE');
    expect(result.enrollment.monthlyEmployeeCost).toBe(70.0);
    expect(result.enrollment.payrollDeductionConfirmed).toBe(true);
    expect(result.auditEventId).toBeDefined();

    // Verify audit log has PAY_AFFECTING authority class
    const logs = service.getAuditLogs();
    const lastLog = logs[logs.length - 1];
    expect(lastLog.action).toBe('BENEFIT_ELECTED');
    expect(lastLog.payload.authorityClass).toBe('PAY_AFFECTING');
  });

  it('should reject election if cross-jurisdiction plan is selected (V3)', async () => {
    const ukPlans = (await service.getPlans('GB')).items;
    const ukPlan = ukPlans[0];

    await expect(
      service.electOrWaive('task-101', priyaWorker, {
        action: 'ELECT',
        planId: ukPlan.id,
        coverageTier: 'EMPLOYEE_ONLY',
        preTaxDeductionAcknowledged: true,
        actor: 'priya@demo.io',
      })
    ).rejects.toThrow('Cross-jurisdiction violation');
  });

  it('should successfully waive benefits with valid reason', async () => {
    const result = await service.electOrWaive('task-102', priyaWorker, {
      action: 'WAIVE',
      waiveReason: 'Covered under spouse extended health insurance at another employer.',
      preTaxDeductionAcknowledged: false,
      actor: 'priya@demo.io',
    });

    expect(result.enrollment.status).toBe('WAIVED');
    expect(result.enrollment.waived).toBe(true);
    expect(result.enrollment.waiveReason).toContain('Covered under spouse');
  });
});
