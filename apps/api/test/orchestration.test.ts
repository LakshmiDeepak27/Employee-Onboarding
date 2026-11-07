import { describe, it, expect } from 'vitest';
import {
  computeTaskDeadline,
  countBusinessDays,
  addDays,
  isBusinessDay,
  formatIsoDate,
  type CalendarConfig,
} from '../src/orchestration/deadlineEngine.js';
import {
  validateDAG,
  calculateDepths,
  calculateCriticalPath,
  isTaskReadyForDispatch,
} from '../src/orchestration/dependencyEngine.js';
import {
  calculatePlanProgress,
  derivePlanStatus,
} from '../src/orchestration/progressTracker.js';
import { generatePlanTasks } from '../src/orchestration/taskGenerator.js';

describe('1. Deadline & Calendar Scheduling Engine', () => {
  const config: CalendarConfig = {
    businessDays: [1, 2, 3, 4, 5], // Mon to Fri
    holidays: ['2026-12-25', '2026-12-26'],
    timezone: 'UTC',
  };

  it('correctly identifies business days vs weekends and holidays', () => {
    // 2026-12-01 is Tuesday (working day)
    const tues = new Date(Date.UTC(2026, 11, 1));
    expect(isBusinessDay(tues, config)).toBe(true);

    // 2026-12-06 is Sunday (weekend)
    const sun = new Date(Date.UTC(2026, 11, 6));
    expect(isBusinessDay(sun, config)).toBe(false);

    // 2026-12-25 is Friday but in holidays list
    const xmas = new Date(Date.UTC(2026, 11, 25));
    expect(isBusinessDay(xmas, config)).toBe(false);
  });

  it('adds business days skipping weekends and holidays', () => {
    // Friday Dec 18, 2026 + 5 business days:
    // Mon 21 (1), Tue 22 (2), Wed 23 (3), Thu 24 (4), Fri 25 is holiday, Sat/Sun weekend, Mon 28 is holiday/workday (5)
    const fri = new Date(Date.UTC(2026, 11, 18));
    const result = addDays(fri, 5, 'BUSINESS_DAYS', config);
    expect(formatIsoDate(result)).toBe('2026-12-28');
  });

  it('correctly flags lead-time risk when runway is shorter than procurement lead time', () => {
    const dates = {
      startDate: '2026-12-04', // 3 business days from now
      now: '2026-12-01',
    };

    const deadline = computeTaskDeadline(
      {
        anchor: 'START_DATE',
        offsetDays: -1,
        basis: 'BUSINESS_DAYS',
        leadTimeDays: 5, // Laptop requires 5 business days
      },
      dates,
      config,
    );

    expect(deadline.isAtRisk).toBe(true);
    expect(deadline.riskReason).toContain('Lead time is 5 business days');
  });
});

describe('2. DAG Dependency Engine & Cycle Detection', () => {
  it('validates acyclic graph and computes valid topological ordering', () => {
    const taskIds = ['taskA', 'taskB', 'taskC', 'taskD'];
    const edges = [
      { from: 'taskA', to: 'taskB' }, // A -> B
      { from: 'taskB', to: 'taskC' }, // B -> C
      { from: 'taskA', to: 'taskD' }, // A -> D
    ];

    const result = validateDAG(taskIds, edges);
    expect(result.isAcyclic).toBe(true);
    expect(result.topologicalOrder).toBeDefined();

    // In topological order, A must precede B and D, and B must precede C
    const posA = result.topologicalOrder.indexOf('taskA');
    const posB = result.topologicalOrder.indexOf('taskB');
    const posC = result.topologicalOrder.indexOf('taskC');
    const posD = result.topologicalOrder.indexOf('taskD');

    expect(posA).toBeLessThan(posB);
    expect(posB).toBeLessThan(posC);
    expect(posA).toBeLessThan(posD);
  });

  it('detects cycles and returns isAcyclic = false with cycle path', () => {
    const taskIds = ['task1', 'task2', 'task3'];
    const edges = [
      { from: 'task1', to: 'task2' },
      { from: 'task2', to: 'task3' },
      { from: 'task3', to: 'task1' }, // Cycle: 1 -> 2 -> 3 -> 1
    ];

    const result = validateDAG(taskIds, edges);
    expect(result.isAcyclic).toBe(false);
    expect(result.cycle).toBeDefined();
    expect(result.cycle!.length).toBeGreaterThan(2);
  });

  it('calculates hierarchical depths and critical path', () => {
    const taskIds = ['A', 'B', 'C'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
    ];

    const depths = calculateDepths(['A', 'B', 'C'], edges);
    expect(depths.get('A')).toBe(0);
    expect(depths.get('B')).toBe(1);
    expect(depths.get('C')).toBe(2);

    const cp = calculateCriticalPath(
      [
        { id: 'A', taskType: 'T_A', title: 'A', dueDate: '2026-12-01', earliestStartDate: '2026-12-01' },
        { id: 'B', taskType: 'T_B', title: 'B', dueDate: '2026-12-03', earliestStartDate: '2026-12-01' },
        { id: 'C', taskType: 'T_C', title: 'C', dueDate: '2026-12-05', earliestStartDate: '2026-12-03' },
      ],
      edges,
      ['A', 'B', 'C'],
    );

    expect(cp.criticalPath).toEqual(['A', 'B', 'C']);
  });

  it('checks task dispatch readiness based on completed prerequisites', () => {
    const dependencies = [
      { taskId: 'taskPayroll', dependsOnId: 'taskIdProof' },
    ];

    const statusMapIncomplete = new Map([
      ['taskIdProof', 'IN_PROGRESS'],
    ]);
    expect(isTaskReadyForDispatch('taskPayroll', dependencies, statusMapIncomplete)).toBe(false);

    const statusMapComplete = new Map([
      ['taskIdProof', 'COMPLETED'],
    ]);
    expect(isTaskReadyForDispatch('taskPayroll', dependencies, statusMapComplete)).toBe(true);
  });
});

describe('3. Progress Tracker & Status Transitions', () => {
  it('deterministically calculates completion percentage and day-one readiness', () => {
    const tasks = [
      { id: '1', taskType: 'COLLECT_ID_PROOF', status: 'COMPLETED', dueDate: '2026-12-01' },
      { id: '2', taskType: 'RIGHT_TO_WORK_CHECK', status: 'COMPLETED', dueDate: '2026-12-01' },
      { id: '3', taskType: 'PROVISION_LAPTOP', status: 'IN_PROGRESS', isAtRisk: false, dueDate: '2026-12-01' },
      { id: '4', taskType: 'MANDATORY_COMPLIANCE_TRAINING', status: 'NOT_STARTED', dueDate: '2026-12-14' },
    ];

    const progress = calculatePlanProgress(tasks);
    expect(progress.totalTasks).toBe(4);
    expect(progress.completedTasks).toBe(2);
    expect(progress.completionPercentage).toBe(50);
    expect(progress.isComplete).toBe(false);
    expect(progress.dayOneReady).toBe(true);
  });

  it('transitions overall plan status correctly from APPROVED to IN_PROGRESS to COMPLETED', () => {
    const initialProgress = {
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
    };
    expect(derivePlanStatus('APPROVED', initialProgress)).toBe('APPROVED');

    const inProgress = { ...initialProgress, inProgressTasks: 1, pendingTasks: 3 };
    expect(derivePlanStatus('APPROVED', inProgress)).toBe('IN_PROGRESS');

    const completed = { ...initialProgress, completedTasks: 4, pendingTasks: 0, completionPercentage: 100, isComplete: true };
    expect(derivePlanStatus('IN_PROGRESS', completed)).toBe('COMPLETED');
  });
});

describe('4. Task Generator Idempotency & Rules Synthesis', () => {
  const dummyProfile = {
    employeeId: 'emp-101',
    employeeNumber: 'EMP-101',
    firstName: 'Priya',
    lastName: 'Nair',
    fullName: 'Priya Nair',
    personalEmail: 'priya@demo.io',
    workEmail: null,
    jobTitle: 'Software Engineer',
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
    workMode: 'HYBRID',
    startDate: '2026-12-15',
    offerDate: null,
    unionMember: false,
    notes: null,
    status: 'PRE_HIRE',
  };

  it('prevents duplicate tasks and properly maps dependencies', () => {
    const mandatoryRules = [
      {
        taskType: 'COLLECT_ID_PROOF',
        service: 'DOCUMENTS' as const,
        title: 'ID Proof',
        description: 'Collect ID',
        ownerRole: 'HR' as const,
        authorityClass: 'ROUTINE' as const,
        deadlineAnchor: 'START_DATE' as const,
        deadlineOffsetDays: -7,
        deadlineBasis: 'BUSINESS_DAYS' as const,
        leadTimeDays: 0,
        dependsOnTypes: [],
        isMandatory: true,
      },
      {
        taskType: 'PROVISION_LAPTOP',
        service: 'EQUIPMENT' as const,
        title: 'Laptop Provision',
        description: 'Provide laptop',
        ownerRole: 'IT' as const,
        authorityClass: 'ROUTINE' as const,
        deadlineAnchor: 'START_DATE' as const,
        deadlineOffsetDays: -1,
        deadlineBasis: 'BUSINESS_DAYS' as const,
        leadTimeDays: 5,
        dependsOnTypes: ['COLLECT_ID_PROOF'],
        isMandatory: true,
      },
    ];

    const generated = generatePlanTasks('plan-1', dummyProfile, mandatoryRules, [], 'BASELINE_FALLBACK');

    expect(generated.tasks.length).toBe(2);
    const idTypes = generated.tasks.map((t) => t.taskType);
    expect(new Set(idTypes).size).toBe(2); // strictly unique
    expect(generated.dependencies.length).toBe(1);
    expect(generated.topologicalOrder.length).toBe(2);
  });
});

