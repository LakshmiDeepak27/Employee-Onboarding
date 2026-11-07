import { describe, it, expect, vi } from 'vitest';
import { generatePlanTasks } from '../src/orchestration/taskGenerator.js';
import { calculatePlanProgress, derivePlanStatus } from '../src/orchestration/progressTracker.js';
import { ValidatorChain } from '../src/ai/validatorChain.js';
import type { ProcessedProfile } from '../src/orchestration/profileProcessor.js';
import type { MandatoryTaskRule } from '../src/orchestration/rulesEngine.js';

describe('Onboarding lifecycle logic', () => {
  const newHireProfile: ProcessedProfile = {
    employeeId: 'emp-e2e-001',
    employeeNumber: 'EMP-E2E-001',
    firstName: 'Sara',
    lastName: 'Connor',
    fullName: 'Sara Connor',
    personalEmail: 'sara.connor@demo.io',
    workEmail: null,
    jobTitle: 'DevOps Engineer',
    roleFamily: 'engineering',
    departmentId: null,
    departmentName: 'Engineering',
    managerId: null,
    jurisdictionCode: 'CA-ON',
    jurisdictionName: 'Ontario, Canada',
    countryCode: 'CA',
    businessDays: [1, 2, 3, 4, 5],
    timezone: 'America/Toronto',
    hasPolicyCorpus: true,
    employmentType: 'FULL_TIME',
    workMode: 'REMOTE',
    startDate: '2026-12-15',
    offerDate: null,
    unionMember: false,
    notes: null,
    status: 'PRE_HIRE',
  };

  const mandatoryRules: MandatoryTaskRule[] = [
    {
      taskType: 'COLLECT_ID_PROOF',
      service: 'DOCUMENTS',
      title: 'Collect Government Photo ID',
      description: 'Collect ID',
      ownerRole: 'HR',
      authorityClass: 'ROUTINE',
      deadlineAnchor: 'START_DATE',
      deadlineOffsetDays: -7,
      deadlineBasis: 'BUSINESS_DAYS',
      leadTimeDays: 0,
      dependsOnTypes: [],
      isMandatory: true,
    },
    {
      taskType: 'RIGHT_TO_WORK_CHECK',
      service: 'DOCUMENTS',
      title: 'Right to Work Verification',
      description: 'Statutory verification',
      ownerRole: 'HR',
      authorityClass: 'LEGAL',
      deadlineAnchor: 'START_DATE',
      deadlineOffsetDays: -3,
      deadlineBasis: 'BUSINESS_DAYS',
      leadTimeDays: 0,
      dependsOnTypes: ['COLLECT_ID_PROOF'],
      isMandatory: true,
    },
    {
      taskType: 'PROVISION_LAPTOP',
      service: 'EQUIPMENT',
      title: 'Provision Work Laptop',
      description: 'Configure laptop',
      ownerRole: 'IT',
      authorityClass: 'ROUTINE',
      deadlineAnchor: 'START_DATE',
      deadlineOffsetDays: -1,
      deadlineBasis: 'BUSINESS_DAYS',
      leadTimeDays: 5,
      dependsOnTypes: [],
      isMandatory: true,
    },
    {
      taskType: 'PAYROLL_PROFILE_SETUP',
      service: 'PAYROLL',
      title: 'Set up Payroll Profile',
      description: 'Finance setup',
      ownerRole: 'FINANCE',
      authorityClass: 'PAY_AFFECTING',
      deadlineAnchor: 'START_DATE',
      deadlineOffsetDays: 0,
      deadlineBasis: 'BUSINESS_DAYS',
      leadTimeDays: 0,
      dependsOnTypes: ['COLLECT_ID_PROOF'],
      isMandatory: true,
    },
  ];

  it('prevents a model from weakening template authority, dependencies or deadlines', () => {
    const rule = mandatoryRules.find(r => r.authorityClass === 'LEGAL')!;
    const generated = generatePlanTasks('guardrail-test', newHireProfile, mandatoryRules, [{
      taskType: rule.taskType, title: 'Model proposal', service: 'MANAGER', ownerRole: 'EMPLOYEE',
      authorityClass: 'ROUTINE', deadlineAnchor: 'START_DATE', deadlineOffsetDays: 365,
      dependsOnTypes: [], citations: [],
    }], 'LLM_GROUNDED');
    const task = generated.tasks.find(t => t.taskType === rule.taskType)!;
    expect(task.authorityClass).toBe('LEGAL');
    expect(task.reviewState).toBe('NEEDS_REVIEW');
    expect(task.service).toBe(rule.service);
    expect(task.dependsOnTaskTypes).toEqual(rule.dependsOnTypes);
    const baseline = generatePlanTasks('baseline-test', newHireProfile, mandatoryRules);
    expect(task.dueDate).toEqual(baseline.tasks.find(t => t.taskType === rule.taskType)!.dueDate);
  });

  it('runs complete onboarding cycle: profile -> proposal -> validation -> graph -> approval -> dispatch -> progress', async () => {
    // 1. Proposal simulation
    const rawAiProposal = {
      tasks: [
        {
          taskType: 'COLLECT_ID_PROOF',
          service: 'DOCUMENTS',
          title: 'Collect Government Photo ID',
          description: 'Verified ID document',
          ownerRole: 'HR',
          authorityClass: 'ROUTINE',
          deadlineAnchor: 'START_DATE',
          deadlineOffsetDays: -7,
          dependsOnTypes: [],
          citations: [
            {
              clauseId: 'CA-ON-DOC-001',
              quotedText: 'valid government photo identification and documentation',
            },
          ],
        },
        {
          taskType: 'RIGHT_TO_WORK_CHECK',
          service: 'DOCUMENTS',
          title: 'Right to Work Verification',
          description: 'Legal check',
          ownerRole: 'HR',
          authorityClass: 'LEGAL',
          deadlineAnchor: 'START_DATE',
          deadlineOffsetDays: -3,
          dependsOnTypes: ['COLLECT_ID_PROOF'],
          citations: [
            {
              clauseId: 'CA-ON-DOC-001',
              quotedText: 'demonstrating legal entitlement to work in Canada',
            },
          ],
        },
      ],
      unsupported: false,
    };

    // 2. Deterministic Validation Chain
    const validator = new ValidatorChain();
    const validationResult = await validator.validate(rawAiProposal, newHireProfile, mandatoryRules);
    expect(validationResult.isValid).toBe(true);

    // V4 inserted omitted mandatory tasks (PROVISION_LAPTOP and PAYROLL_PROFILE_SETUP)
    const insertedFindings = validationResult.findings.filter((f) => f.action === 'INSERTED');
    expect(insertedFindings.length).toBe(2);

    // 3. Task Generation & Dependency DAG Construction
    const generated = generatePlanTasks(
      'plan-e2e-001',
      newHireProfile,
      mandatoryRules,
      validationResult.sanitizedProposal.tasks as any,
      'LLM_GROUNDED',
    );

    expect(generated.tasks.length).toBe(4);
    expect(generated.topologicalOrder.length).toBe(4);
    expect(generated.criticalPath.length).toBeGreaterThan(0);

    // Verify RIGHT_TO_WORK_CHECK is flagged NEEDS_REVIEW because it is LEGAL
    const rtwTask = generated.tasks.find((t) => t.taskType === 'RIGHT_TO_WORK_CHECK');
    expect(rtwTask?.reviewState).toBe('NEEDS_REVIEW');
    expect(rtwTask?.authorityClass).toBe('LEGAL');

    // 4. Human Approval Gate
    // If sensitive tasks are in NEEDS_REVIEW, approval is blocked
    const hasUnreviewedBlockers = generated.tasks.some(
      (t) => (t.authorityClass === 'LEGAL' || t.authorityClass === 'PAY_AFFECTING') && t.reviewState === 'NEEDS_REVIEW',
    );
    expect(hasUnreviewedBlockers).toBe(true);

    // Simulate HR Admin reviewing and acknowledging sensitive tasks
    for (const t of generated.tasks) {
      t.reviewState = 'OK';
    }

    const postReviewBlockers = generated.tasks.some(
      (t) => (t.authorityClass === 'LEGAL' || t.authorityClass === 'PAY_AFFECTING') && t.reviewState === 'NEEDS_REVIEW',
    );
    expect(postReviewBlockers).toBe(false);

    // 5. Task Dispatch & Workflow execution
    let planStatus = derivePlanStatus('AWAITING_APPROVAL', {
      totalTasks: 4,
      completedTasks: 0,
      pendingTasks: 4,
      inProgressTasks: 0,
      blockedTasks: 0,
      atRiskTasks: 0,
      needsReviewTasks: 0,
      completionPercentage: 0,
      dayOneReady: true,
      isComplete: false,
    });
    expect(planStatus).toBe('AWAITING_APPROVAL');

    // Plan approved:
    planStatus = 'APPROVED';

    // Department tasks complete one by one
    const taskStates = generated.tasks.map((t) => ({
      id: t.id,
      taskType: t.taskType,
      status: 'NOT_STARTED',
      dueDate: t.dueDate.toISOString().slice(0, 10),
    }));

    // Complete ID proof
    taskStates[0]!.status = 'COMPLETED';
    let progress = calculatePlanProgress(taskStates);
    expect(progress.completionPercentage).toBe(25);
    planStatus = derivePlanStatus(planStatus, progress);
    expect(planStatus).toBe('IN_PROGRESS');

    // Complete all remaining tasks
    taskStates[1]!.status = 'COMPLETED';
    taskStates[2]!.status = 'COMPLETED';
    taskStates[3]!.status = 'COMPLETED';

    progress = calculatePlanProgress(taskStates);
    expect(progress.completionPercentage).toBe(100);
    expect(progress.isComplete).toBe(true);

    planStatus = derivePlanStatus(planStatus, progress);
    expect(planStatus).toBe('COMPLETED');
  });
});


vi.mock('../src/db/client.js', () => ({ prisma: { policyClause: { findUnique: vi.fn(async ({ where }) => where.id === 'CA-ON-DOC-001' ? {
 id: where.id, heading: 'Identity', jurisdictionCode: 'CA-ON',
 body: 'All employees performing work in Ontario must present valid government photo identification and documentation demonstrating legal entitlement to work in Canada prior to commencing employment duties.',
 document: { title: 'Test fixture', isMock: true }
} : null) } } }));
