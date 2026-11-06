import { describe, it, expect } from 'vitest';
import { TrainingService } from '../src/services/training/training-service';
import { TrainingAgent, WorkerTrainingContext } from '../src/services/training/training-agent';
import {
  computeTrainingDueDate,
  resolveMandatoryCourses,
} from '../src/services/training/training-rules';

describe('Tier 1: Unit Tests - Deterministic Rules & Statutory Deadlines (V6)', () => {
  it('should compute exact 7-day statutory deadline for Ontario OHS (Reg 297/13)', () => {
    const startDate = '2026-12-01';
    const deadline = computeTrainingDueDate(startDate, 7, new Date('2026-12-01'));

    expect(deadline.dueDate).toBe('2026-12-08');
    expect(deadline.daysRemaining).toBe(7);
    expect(deadline.isAtRisk).toBe(false);
    expect(deadline.isOverdue).toBe(false);
  });

  it('should compute exact 30-day statutory deadline for UK GDPR (DPA 2018)', () => {
    const startDate = '2026-12-01';
    const deadline = computeTrainingDueDate(startDate, 30, new Date('2026-12-01'));

    expect(deadline.dueDate).toBe('2026-12-31');
    expect(deadline.daysRemaining).toBe(30);
  });

  it('should flag isAtRisk when remaining statutory days <= 3', () => {
    const startDate = '2026-12-01';
    // Current date is 2026-12-06 (2 days remaining on 7-day deadline)
    const currentDate = new Date('2026-12-06');
    const deadline = computeTrainingDueDate(startDate, 7, currentDate);

    expect(deadline.dueDate).toBe('2026-12-08');
    expect(deadline.daysRemaining).toBe(2);
    expect(deadline.isAtRisk).toBe(true);
    expect(deadline.riskReason).toContain('Mandatory statutory training deadline expires in 2 day(s)');
  });

  it('should resolve mandatory courses for Ontario Software Engineer (OHS + SOC2 + Toolchain)', () => {
    const mandatory = resolveMandatoryCourses('CA-ON', 'engineering');
    expect(mandatory).toContain('OHS-ON-101');
    expect(mandatory).toContain('SEC-ALL-101');
    expect(mandatory).toContain('ENG-TOOL-101');
  });

  it('should resolve mandatory courses for UK Marketing hire (UK-DP + SOC2, no toolchain)', () => {
    const mandatory = resolveMandatoryCourses('GB', 'marketing');
    expect(mandatory).toContain('UK-DP-101');
    expect(mandatory).toContain('SEC-ALL-101');
    expect(mandatory).not.toContain('ENG-TOOL-101');
  });
});

describe('Tier 2: Integration Tests - Training Service & Learning Academy Pathways', () => {
  it('should query course catalog with role and jurisdiction filtering', async () => {
    const service = new TrainingService();
    const allCourses = await service.getCourses();
    expect(allCourses.length).toBe(5);

    const onCourses = await service.getCourses('CA-ON', 'engineering');
    expect(onCourses.some((c) => c.code === 'OHS-ON-101')).toBe(true);
    expect(onCourses.some((c) => c.code === 'ENG-TOOL-101')).toBe(true);
  });

  it('should auto-assign mandatory statutory courses for a new hire and calculate progress', async () => {
    const service = new TrainingService();
    const taskId = 'task-trn-1001';
    const worker: WorkerTrainingContext = {
      id: 'worker-priya-ca',
      fullName: 'Priya Nair',
      jurisdictionCode: 'CA-ON',
      employmentType: 'FULL_TIME',
      roleFamily: 'engineering',
      startDate: '2026-12-01',
    };

    const assigned = await service.autoAssignMandatoryCourses(taskId, worker);
    expect(assigned.length).toBeGreaterThanOrEqual(3);

    const codes = assigned.map((a) => a.course.code);
    expect(codes).toContain('OHS-ON-101');
    expect(codes).toContain('SEC-ALL-101');
    expect(codes).toContain('ENG-TOOL-101');

    // Pathway progress initially
    const initialProgress = await service.calculateProgress(taskId);
    expect(initialProgress.totalAssigned).toBe(assigned.length);
    expect(initialProgress.totalCompleted).toBe(0);
    expect(initialProgress.compliancePercent).toBe(0);
    expect(initialProgress.isCompliant).toBe(false);

    // Complete statutory course OHS-ON-101
    const ohsAssignment = assigned.find((a) => a.course.code === 'OHS-ON-101')!;
    await service.completeTraining(ohsAssignment.id, 95);

    const updatedProgress = await service.calculateProgress(taskId);
    expect(updatedProgress.totalCompleted).toBe(1);
    expect(updatedProgress.mandatoryCompleted).toBe(1);
    expect(updatedProgress.compliancePercent).toBeGreaterThan(0);
  });

  it('should record audit trail for assignments and completions', async () => {
    const service = new TrainingService();
    const taskId = 'task-trn-audit';
    const course = (await service.getCourses())[0];

    const assignment = await service.assignCourse(taskId, course.id, '2026-12-01', undefined, 'hr-admin');
    await service.completeTraining(assignment.id, 100, undefined, 'worker-priya');

    const audit = service.getAuditTrail(taskId);
    expect(audit.length).toBe(2);
    expect(audit[0].action).toBe('TRAINING_COURSE_ASSIGNED');
    expect(audit[1].action).toBe('TRAINING_COURSE_COMPLETED');
    expect(audit[1].actorId).toBe('worker-priya');
  });
});

describe('Tier 3: AI Grounded Agent, Citations (V2) & Grounded Refusal (V3)', () => {
  it('should perform Grounded Refusal for Singapore hire (V3 Jurisdiction Scope)', async () => {
    const agent = new TrainingAgent();
    const worker: WorkerTrainingContext = {
      id: 'worker-sg',
      fullName: 'Alex Tan',
      jurisdictionCode: 'SG',
      employmentType: 'FULL_TIME',
      roleFamily: 'consulting',
      startDate: '2026-12-01',
    };

    const result = await agent.generateAdvice(worker);
    expect(result.status).toBe('REFUSAL');
    expect(result.refusalReason).toContain('does not support jurisdiction \'SG\'');
    expect(result.findings.some((f) => f.validator === 'V3_JURISDICTION_SCOPE')).toBe(true);
  });

  it('should perform Grounded Refusal for Contractor (V3 Ineligible Employment Type)', async () => {
    const agent = new TrainingAgent();
    const worker: WorkerTrainingContext = {
      id: 'worker-cont',
      fullName: 'John Contractor',
      jurisdictionCode: 'CA-ON',
      employmentType: 'CONTRACTOR',
      roleFamily: 'engineering',
      startDate: '2026-12-01',
    };

    const result = await agent.generateAdvice(worker);
    expect(result.status).toBe('REFUSAL');
    expect(result.refusalReason).toContain('Contractor workers are excluded');
  });

  it('should generate grounded advice with valid citations and 5-signal composite confidence', async () => {
    const agent = new TrainingAgent();
    const worker: WorkerTrainingContext = {
      id: 'worker-priya-ca',
      fullName: 'Priya Nair',
      jurisdictionCode: 'CA-ON',
      employmentType: 'FULL_TIME',
      roleFamily: 'engineering',
      startDate: '2026-12-01',
    };

    const result = await agent.generateAdvice(worker);
    expect(['SUCCESS', 'DEGRADED_FALLBACK']).toContain(result.status);
    expect(result.advice).toBeDefined();

    const advice = result.advice!;
    expect(advice.mandatoryCourses.length).toBeGreaterThan(0);
    expect(advice.citations.length).toBeGreaterThan(0);
    expect(advice.confidence).toBeGreaterThanOrEqual(0.85);

    // Verify 5 confidence signals
    expect(advice.confidenceBreakdown.citationQuoteMatch).toBeGreaterThan(0);
    expect(advice.confidenceBreakdown.retrievalScore).toBeGreaterThan(0);
    expect(advice.confidenceBreakdown.templateCorroboration).toBeGreaterThan(0);
    expect(advice.confidenceBreakdown.validatorCleanRate).toBeGreaterThan(0);
    expect(advice.confidenceBreakdown.schemaFirstPass).toBeGreaterThan(0);
  });
});
