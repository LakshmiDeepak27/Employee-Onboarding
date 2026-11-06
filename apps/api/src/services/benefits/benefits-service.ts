import {
  BenefitEnrollment,
  BenefitPlan,
  ElectBenefitRequest,
  PageMeta,
  RequestBenefitAdvice,
} from '@eo/contracts';
import { BenefitsAgent, WorkerContext } from './benefits-agent';
import { computeEnrolmentWindow, computePayrollImpact } from './benefits-rules';

// Pre-seeded Plans for CA-ON, GB, US-CA
export const SEED_BENEFIT_PLANS: BenefitPlan[] = [
  {
    id: 'b1000000-0000-0000-0000-000000000001',
    code: 'CA-ON-HLTH-STD',
    name: 'Ontario Standard Health & Dental Plan',
    category: 'HEALTH',
    jurisdictionCode: 'CA-ON',
    tierCosts: [
      { tier: 'EMPLOYEE_ONLY', monthlyEmployeeCost: 35.0, monthlyEmployerCost: 140.0 },
      { tier: 'EMPLOYEE_PLUS_SPOUSE', monthlyEmployeeCost: 70.0, monthlyEmployerCost: 280.0 },
      { tier: 'EMPLOYEE_PLUS_FAMILY', monthlyEmployeeCost: 110.0, monthlyEmployerCost: 440.0 },
    ],
    payrollDeductionPreTax: true,
    description: 'Comprehensive extended health, prescription drugs (80%), dental cleanings, and vision care.',
    keyHighlights: ['80% Prescription Drugs', '$2,000 Annual Dental Maximum', '$400 Vision Care every 24 mo'],
    policyClauseId: 'CA-ON-BEN-001',
    isDefaultRecommended: true,
    isActive: true,
  },
  {
    id: 'b1000000-0000-0000-0000-000000000002',
    code: 'CA-ON-RRSP-MATCH',
    name: 'Group RRSP Wealth Builder (4% Match)',
    category: 'RETIREMENT',
    jurisdictionCode: 'CA-ON',
    tierCosts: [
      { tier: 'EMPLOYEE_ONLY', monthlyEmployeeCost: 150.0, monthlyEmployerCost: 150.0 },
      { tier: 'EMPLOYEE_PLUS_SPOUSE', monthlyEmployeeCost: 150.0, monthlyEmployerCost: 150.0 },
      { tier: 'EMPLOYEE_PLUS_FAMILY', monthlyEmployeeCost: 150.0, monthlyEmployerCost: 150.0 },
    ],
    payrollDeductionPreTax: true,
    description: 'Voluntary group RRSP retirement plan with 100% employer match up to 4% base salary.',
    keyHighlights: ['Immediate Vesting', 'Pre-tax payroll deduction', 'Multiple target-date index funds'],
    policyClauseId: 'CA-ON-BEN-003',
    isDefaultRecommended: false,
    isActive: true,
  },
  {
    id: 'b1000000-0000-0000-0000-000000000003',
    code: 'GB-HLTH-PMI',
    name: 'UK AXA Private Medical Insurance (PMI)',
    category: 'HEALTH',
    jurisdictionCode: 'GB',
    tierCosts: [
      { tier: 'EMPLOYEE_ONLY', monthlyEmployeeCost: 0.0, monthlyEmployerCost: 95.0 }, // 100% Employer paid
      { tier: 'EMPLOYEE_PLUS_SPOUSE', monthlyEmployeeCost: 45.0, monthlyEmployerCost: 95.0 },
      { tier: 'EMPLOYEE_PLUS_FAMILY', monthlyEmployeeCost: 75.0, monthlyEmployerCost: 95.0 },
    ],
    payrollDeductionPreTax: true,
    description: 'Private medical cover supplementing NHS with private specialist consultations and surgery.',
    keyHighlights: ['AXA Health Network', 'Mental Health Support', 'Nil excess on standard diagnostics'],
    policyClauseId: 'GB-BEN-001',
    isDefaultRecommended: true,
    isActive: true,
  },
  {
    id: 'b1000000-0000-0000-0000-000000000004',
    code: 'GB-PENS-AUTO',
    name: 'UK Workplace Pension Scheme (Pensions Act 2008)',
    category: 'RETIREMENT',
    jurisdictionCode: 'GB',
    tierCosts: [
      { tier: 'EMPLOYEE_ONLY', monthlyEmployeeCost: 125.0, monthlyEmployerCost: 100.0 },
      { tier: 'EMPLOYEE_PLUS_SPOUSE', monthlyEmployeeCost: 125.0, monthlyEmployerCost: 100.0 },
      { tier: 'EMPLOYEE_PLUS_FAMILY', monthlyEmployeeCost: 125.0, monthlyEmployerCost: 100.0 },
    ],
    payrollDeductionPreTax: true,
    description: 'Statutory workplace pension with 5% employee and 4% employer qualifying contributions.',
    keyHighlights: ['Auto-enrolment compliance', 'Postponement period notice', 'Salary sacrifice tax relief'],
    policyClauseId: 'GB-BEN-002',
    isDefaultRecommended: true,
    isActive: true,
  },
  {
    id: 'b1000000-0000-0000-0000-000000000005',
    code: 'US-CA-HLTH-PPO',
    name: 'California Anthem Premier PPO & Dental',
    category: 'HEALTH',
    jurisdictionCode: 'US-CA',
    tierCosts: [
      { tier: 'EMPLOYEE_ONLY', monthlyEmployeeCost: 60.0, monthlyEmployerCost: 380.0 },
      { tier: 'EMPLOYEE_PLUS_SPOUSE', monthlyEmployeeCost: 140.0, monthlyEmployerCost: 650.0 },
      { tier: 'EMPLOYEE_PLUS_FAMILY', monthlyEmployeeCost: 220.0, monthlyEmployerCost: 950.0 },
    ],
    payrollDeductionPreTax: true,
    description: 'Section 125 Cafeteria plan with low deductible, out-of-network freedom, and preventative dental.',
    keyHighlights: ['$500 Individual Deductible', '90% In-Network Co-insurance', 'National Provider Directory'],
    policyClauseId: 'US-CA-BEN-001',
    isDefaultRecommended: true,
    isActive: true,
  },
  {
    id: 'b1000000-0000-0000-0000-000000000006',
    code: 'US-CA-RET-401K',
    name: 'Dayforce Safe Harbor 401(k) & Retirement Savings (4% Match)',
    category: 'RETIREMENT',
    jurisdictionCode: 'US-CA',
    tierCosts: [
      { tier: 'EMPLOYEE_ONLY', monthlyEmployeeCost: 150.0, monthlyEmployerCost: 150.0 },
      { tier: 'EMPLOYEE_PLUS_SPOUSE', monthlyEmployeeCost: 150.0, monthlyEmployerCost: 150.0 },
      { tier: 'EMPLOYEE_PLUS_FAMILY', monthlyEmployeeCost: 150.0, monthlyEmployerCost: 150.0 },
    ],
    payrollDeductionPreTax: true,
    description: 'Automatic enrolment at 3% salary with 100% employer match up to 4%. Immediate vesting.',
    keyHighlights: ['100% Match up to 4%', 'Immediate 100% Vesting', 'Pre-tax Section 401(k) payroll deduction'],
    policyClauseId: 'US-CA-BEN-002',
    isDefaultRecommended: true,
    isActive: true,
  },
];

export interface AuditRecord {
  id: string;
  actor: string;
  action: string;
  payload: any;
  timestamp: string;
}

/**
 * BenefitsService
 *
 * Core service layer managing the benefits lifecycle, deterministic window calculations,
 * election storage, audit trails, and agent integration.
 */
export class BenefitsService {
  private plans: Map<string, BenefitPlan> = new Map();
  private enrollments: Map<string, BenefitEnrollment> = new Map();
  private auditLogs: AuditRecord[] = [];
  private agent: BenefitsAgent;

  constructor(geminiApiKey?: string) {
    this.agent = new BenefitsAgent(geminiApiKey);

    // Initialize in-memory seed plans
    for (const plan of SEED_BENEFIT_PLANS) {
      this.plans.set(plan.id, plan);
    }
  }

  /**
   * List available benefit plans filtered by jurisdiction or category
   */
  async getPlans(jurisdictionCode?: string, category?: string): Promise<{ items: BenefitPlan[]; meta: PageMeta }> {
    let items = Array.from(this.plans.values()).filter((p) => p.isActive);

    if (jurisdictionCode) {
      items = items.filter((p) => p.jurisdictionCode === jurisdictionCode);
    }
    if (category) {
      items = items.filter((p) => p.category === category);
    }

    return {
      items,
      meta: {
        page: 1,
        pageSize: items.length,
        totalItems: items.length,
        totalPages: 1,
      },
    };
  }

  /**
   * Get 1:1 benefit enrollment detail for a task, with window countdown and AI guidance
   */
  async getEnrollmentForTask(
    taskId: string,
    worker: WorkerContext
  ): Promise<BenefitEnrollment> {
    let enrollment = this.enrollments.get(taskId);

    // If not yet initialized, create a new 1:1 record tied to the task
    if (!enrollment) {
      const windowCalc = computeEnrolmentWindow(worker.startDate, worker.jurisdictionCode);

      enrollment = {
        id: `enr-${taskId}`,
        taskId,
        employeeId: worker.id,
        employeeName: worker.fullName,
        jurisdictionCode: worker.jurisdictionCode,
        status: 'NOT_STARTED',
        enrolmentWindowStart: windowCalc.windowStart,
        enrolmentWindowEnd: windowCalc.windowEnd,
        daysRemaining: windowCalc.daysRemaining,
        isAtRisk: windowCalc.isAtRisk,
        riskReason: windowCalc.riskReason,
        electedPlanId: null,
        coverageTier: null,
        dependents: [],
        monthlyEmployeeCost: null,
        monthlyEmployerCost: null,
        waived: false,
        waiveReason: null,
        decisionDate: null,
        payrollDeductionConfirmed: false,
        citations: [],
        aiGuidance: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.enrollments.set(taskId, enrollment);
    } else {
      // Recompute countdown dynamically (V6 Code Wins)
      const windowCalc = computeEnrolmentWindow(worker.startDate, worker.jurisdictionCode);
      enrollment.daysRemaining = windowCalc.daysRemaining;
      enrollment.isAtRisk = windowCalc.isAtRisk;
      enrollment.riskReason = windowCalc.riskReason;
    }

    return enrollment;
  }

  /**
   * Run the AI Benefits Agent to produce grounded advice with citations
   */
  async generateAdvice(
    taskId: string,
    worker: WorkerContext,
    request: RequestBenefitAdvice
  ) {
    const enrollment = await this.getEnrollmentForTask(taskId, worker);
    const availablePlans = (await this.getPlans(worker.jurisdictionCode)).items;

    const result = await this.agent.generateAdvice(worker, availablePlans, request);

    if (result.status === 'SUCCESS' && result.advice) {
      enrollment.aiGuidance = result.advice;
      enrollment.citations = result.advice.citations;
      enrollment.updatedAt = new Date().toISOString();
      this.enrollments.set(taskId, enrollment);
    }

    return result;
  }

  /**
   * Elect or Waive a Benefit
   */
  async electOrWaive(
    taskId: string,
    worker: WorkerContext,
    request: ElectBenefitRequest
  ): Promise<{ enrollment: BenefitEnrollment; auditEventId: string }> {
    const enrollment = await this.getEnrollmentForTask(taskId, worker);

    // Enforce Statutory Window Deadline
    const windowCalc = computeEnrolmentWindow(worker.startDate, worker.jurisdictionCode);
    if (windowCalc.isExpired) {
      throw new Error(
        `Cannot complete election: Enrolment window expired on ${windowCalc.windowEnd}. Contact HR Compliance for Evidence of Insurability (EOI).`
      );
    }

    if (request.action === 'ELECT') {
      const plan = this.plans.get(request.planId!);
      if (!plan) {
        throw new Error(`Plan with ID ${request.planId} not found.`);
      }

      if (plan.jurisdictionCode !== worker.jurisdictionCode) {
        throw new Error(
          `Cross-jurisdiction violation (V3): Cannot elect ${plan.jurisdictionCode} plan for employee in ${worker.jurisdictionCode}.`
        );
      }

      const tierCost = plan.tierCosts.find((c) => c.tier === request.coverageTier);
      if (!tierCost) {
        throw new Error(`Tier ${request.coverageTier} is not available for plan ${plan.name}.`);
      }

      const payroll = computePayrollImpact(tierCost.monthlyEmployeeCost, plan.payrollDeductionPreTax);

      enrollment.status = 'ELECTED';
      enrollment.electedPlanId = plan.id;
      enrollment.electedPlan = plan;
      enrollment.coverageTier = request.coverageTier!;
      enrollment.dependents = request.dependents || [];
      enrollment.monthlyEmployeeCost = payroll.monthlyEmployeeCost;
      enrollment.monthlyEmployerCost = tierCost.monthlyEmployerCost;
      enrollment.waived = false;
      enrollment.waiveReason = null;
      enrollment.decisionDate = new Date().toISOString().split('T')[0];
      enrollment.payrollDeductionConfirmed = true;
      enrollment.updatedAt = new Date().toISOString();

      // Append-only audit record
      const auditRecord: AuditRecord = {
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        actor: request.actor,
        action: 'BENEFIT_ELECTED',
        payload: {
          taskId,
          employeeId: worker.id,
          planId: plan.id,
          planCode: plan.code,
          tier: request.coverageTier,
          monthlyEmployeeDeduction: payroll.monthlyEmployeeCost,
          monthlyEmployerCost: tierCost.monthlyEmployerCost,
          authorityClass: 'PAY_AFFECTING',
        },
        timestamp: new Date().toISOString(),
      };
      this.auditLogs.push(auditRecord);

      return { enrollment, auditEventId: auditRecord.id };
    } else {
      // WAIVE action
      enrollment.status = 'WAIVED';
      enrollment.electedPlanId = null;
      enrollment.electedPlan = null;
      enrollment.coverageTier = null;
      enrollment.dependents = [];
      enrollment.monthlyEmployeeCost = 0;
      enrollment.monthlyEmployerCost = 0;
      enrollment.waived = true;
      enrollment.waiveReason = request.waiveReason!;
      enrollment.decisionDate = new Date().toISOString().split('T')[0];
      enrollment.payrollDeductionConfirmed = false;
      enrollment.updatedAt = new Date().toISOString();

      const auditRecord: AuditRecord = {
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        actor: request.actor,
        action: 'BENEFIT_WAIVED',
        payload: {
          taskId,
          employeeId: worker.id,
          waiveReason: request.waiveReason,
          statutoryAcknowledged: true,
        },
        timestamp: new Date().toISOString(),
      };
      this.auditLogs.push(auditRecord);

      return { enrollment, auditEventId: auditRecord.id };
    }
  }

  /**
   * Work Queue for HR Admin
   */
  async getWorkQueue(filters?: { status?: string; jurisdiction?: string; atRiskOnly?: boolean }) {
    let items = Array.from(this.enrollments.values());

    if (filters?.status) {
      items = items.filter((e) => e.status === filters.status);
    }
    if (filters?.jurisdiction) {
      items = items.filter((e) => e.jurisdictionCode === filters.jurisdiction);
    }
    if (filters?.atRiskOnly) {
      items = items.filter((e) => e.isAtRisk);
    }

    return {
      items,
      meta: {
        page: 1,
        pageSize: items.length,
        totalItems: items.length,
        totalPages: 1,
      },
    };
  }

  /**
   * Audit trail getter
   */
  getAuditLogs() {
    return [...this.auditLogs];
  }
}
