import {
  TrainingAssignment,
  TrainingCourse,
  TrainingStatusEnum,
  LearningPathwayProgress,
} from '@eo/contracts';
import { TrainingAgent, WorkerTrainingContext, TrainingAgentResult } from './training-agent.js';
import { computeTrainingDueDate, resolveMandatoryCourses } from './training-rules.js';

export interface AuditEvent {
  id: string;
  taskId: string;
  action: string;
  actorId: string;
  payload: any;
  timestamp: string;
}

// Pre-seeded Course Catalog
export const SEED_TRAINING_COURSES: TrainingCourse[] = [
  {
    id: 'c1000000-0000-0000-0000-000000000001',
    code: 'OHS-ON-101',
    title: 'Ontario Worker Health and Safety Awareness (OHSA)',
    provider: 'Ontario Ministry of Labour / Dayforce L&D',
    durationMinutes: 45,
    mandatoryForJurisdictions: ['CA-ON'],
    mandatoryForRoles: [],
    statutoryDeadlineDays: 7,
  },
  {
    id: 'c1000000-0000-0000-0000-000000000002',
    code: 'UK-DP-101',
    title: 'UK Data Protection & GDPR Compliance',
    provider: 'UK ICO / Dayforce L&D',
    durationMinutes: 35,
    mandatoryForJurisdictions: ['GB'],
    mandatoryForRoles: [],
    statutoryDeadlineDays: 30,
  },
  {
    id: 'c1000000-0000-0000-0000-000000000003',
    code: 'SEC-ALL-101',
    title: 'SOC2 Compliance & Information Security Fundamentals',
    provider: 'Dayforce InfoSec & Compliance',
    durationMinutes: 25,
    mandatoryForJurisdictions: ['CA-ON', 'GB', 'US-CA'],
    mandatoryForRoles: [],
    statutoryDeadlineDays: 14,
  },
  {
    id: 'c1000000-0000-0000-0000-000000000004',
    code: 'ENG-TOOL-101',
    title: 'Engineering Toolchain: GitHub, CI/CD, and AWS Security',
    provider: 'Engineering Enablement',
    durationMinutes: 40,
    mandatoryForJurisdictions: [],
    mandatoryForRoles: ['engineering', 'devops', 'qa', 'infrastructure'],
    statutoryDeadlineDays: null,
  },
  {
    id: 'c1000000-0000-0000-0000-000000000005',
    code: 'CUL-ALL-101',
    title: 'Dayforce Culture & Collaborative Leadership',
    provider: 'People & Culture Academy',
    durationMinutes: 18,
    mandatoryForJurisdictions: [],
    mandatoryForRoles: [],
    statutoryDeadlineDays: null,
  },
];

export class TrainingService {
  private courses: Map<string, TrainingCourse> = new Map();
  private assignments: Map<string, TrainingAssignment> = new Map();
  private auditEvents: AuditEvent[] = [];
  private agent: TrainingAgent;

  constructor(agent?: TrainingAgent) {
    this.agent = agent || new TrainingAgent();
    // Seed in-memory courses
    for (const course of SEED_TRAINING_COURSES) {
      this.courses.set(course.id, course);
    }
  }

  /**
   * List courses, optionally filtered by jurisdiction or role
   */
  async getCourses(jurisdictionCode?: string, roleFamily?: string): Promise<TrainingCourse[]> {
    let result = Array.from(this.courses.values());

    if (jurisdictionCode) {
      result = result.filter(
        (c) =>
          c.mandatoryForJurisdictions.length === 0 ||
          c.mandatoryForJurisdictions.includes(jurisdictionCode)
      );
    }

    if (roleFamily) {
      result = result.filter(
        (c) =>
          c.mandatoryForRoles.length === 0 ||
          c.mandatoryForRoles.includes(roleFamily.toLowerCase())
      );
    }

    return result;
  }

  async getCourseById(courseId: string): Promise<TrainingCourse | null> {
    return this.courses.get(courseId) || null;
  }

  async getCourseByCode(code: string): Promise<TrainingCourse | null> {
    for (const course of this.courses.values()) {
      if (course.code.toLowerCase() === code.toLowerCase()) {
        return course;
      }
    }
    return null;
  }

  /**
   * Get all assignments for a task
   */
  async getAssignmentsByTask(taskId: string): Promise<TrainingAssignment[]> {
    return Array.from(this.assignments.values()).filter((a) => a.taskId === taskId);
  }

  async getAssignmentById(assignmentId: string): Promise<TrainingAssignment | null> {
    return this.assignments.get(assignmentId) || null;
  }

  /**
   * Assign a single course to a task
   */
  async assignCourse(
    taskId: string,
    courseId: string,
    startDateStr: string = new Date().toISOString().split('T')[0] ?? '',
    customDueDate?: string,
    actorId: string = 'system'
  ): Promise<TrainingAssignment> {
    const course = this.courses.get(courseId);
    if (!course) {
      throw new Error(`Course not found: ${courseId}`);
    }

    // Deterministic due date calculation
    let dueDate = customDueDate;
    if (!dueDate) {
      const deadline = computeTrainingDueDate(startDateStr, course.statutoryDeadlineDays);
      dueDate = deadline.dueDate;
    }

    const assignment: TrainingAssignment = {
      id: `trn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      taskId,
      course,
      status: 'ASSIGNED',
      assignedAt: new Date().toISOString(),
      dueDate,
      startedAt: null,
      completedAt: null,
      scorePercent: null,
      isStatutory: course.statutoryDeadlineDays !== null,
    };

    this.assignments.set(assignment.id, assignment);

    this.writeAudit(taskId, 'TRAINING_COURSE_ASSIGNED', actorId, {
      assignmentId: assignment.id,
      courseCode: course.code,
      dueDate,
      isStatutory: assignment.isStatutory,
    });

    return assignment;
  }

  /**
   * Auto-assign all mandatory statutory courses for a new hire (V4 Mandatory Coverage)
   */
  async autoAssignMandatoryCourses(
    taskId: string,
    worker: WorkerTrainingContext,
    actorId: string = 'system'
  ): Promise<TrainingAssignment[]> {
    const mandatoryCodes = resolveMandatoryCourses(worker.jurisdictionCode, worker.roleFamily);
    const assigned: TrainingAssignment[] = [];

    for (const code of mandatoryCodes) {
      const course = await this.getCourseByCode(code);
      if (course) {
        const assignment = await this.assignCourse(
          taskId,
          course.id,
          worker.startDate,
          undefined,
          actorId
        );
        assigned.push(assignment);
      }
    }

    // Always assign Dayforce Culture as baseline elective
    const cultureCourse = await this.getCourseByCode('CUL-ALL-101');
    if (cultureCourse) {
      const assignment = await this.assignCourse(
        taskId,
        cultureCourse.id,
        worker.startDate,
        undefined,
        actorId
      );
      assigned.push(assignment);
    }

    return assigned;
  }

  /**
   * Mark a training assignment completed with score
   */
  async completeTraining(
    assignmentId: string,
    scorePercent: number = 100,
    completedAtStr?: string,
    actorId: string = 'employee'
  ): Promise<TrainingAssignment> {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) {
      throw new Error(`Training assignment not found: ${assignmentId}`);
    }

    const completedAt = completedAtStr || new Date().toISOString();
    assignment.status = 'COMPLETED';
    assignment.completedAt = completedAt;
    assignment.scorePercent = scorePercent;

    this.assignments.set(assignment.id, assignment);

    this.writeAudit(assignment.taskId, 'TRAINING_COURSE_COMPLETED', actorId, {
      assignmentId: assignment.id,
      courseCode: assignment.course.code,
      scorePercent,
      completedAt,
    });

    return assignment;
  }

  /**
   * Calculate real-time compliance and progress for the First-Week Pathway
   */
  async calculateProgress(taskId: string): Promise<LearningPathwayProgress> {
    const assignments = await this.getAssignmentsByTask(taskId);

    const totalAssigned = assignments.length;
    const totalCompleted = assignments.filter((a) => a.status === 'COMPLETED').length;
    const mandatory = assignments.filter((a) => a.isStatutory);
    const mandatoryTotal = mandatory.length;
    const mandatoryCompleted = mandatory.filter((a) => a.status === 'COMPLETED').length;
    const statutoryPending = mandatoryTotal - mandatoryCompleted;

    const currentDate = new Date();
    let atRiskCount = 0;
    for (const m of mandatory) {
      if (m.status !== 'COMPLETED') {
        const deadline = computeTrainingDueDate(m.assignedAt.slice(0, 10), m.course.statutoryDeadlineDays, currentDate);
        if (deadline.isAtRisk || deadline.isOverdue) {
          atRiskCount++;
        }
      }
    }

    const compliancePercent =
      mandatoryTotal > 0
        ? Math.round((mandatoryCompleted / mandatoryTotal) * 100)
        : totalAssigned > 0
        ? Math.round((totalCompleted / totalAssigned) * 100)
        : 100;

    return {
      totalAssigned,
      totalCompleted,
      mandatoryCompleted,
      mandatoryTotal,
      statutoryPending,
      compliancePercent,
      isCompliant: statutoryPending === 0,
      atRiskCount,
    };
  }

  /**
   * Generate AI Training Advice via Grounded Agent
   */
  async generateAdvice(
    worker: WorkerTrainingContext,
    userPrompt?: string
  ): Promise<TrainingAgentResult> {
    return this.agent.generateAdvice(worker, userPrompt);
  }

  /**
   * Audit Trail logging
   */
  private writeAudit(taskId: string, action: string, actorId: string, payload: any) {
    const event: AuditEvent = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      taskId,
      action,
      actorId,
      payload,
      timestamp: new Date().toISOString(),
    };
    this.auditEvents.push(event);
  }

  getAuditTrail(taskId?: string): AuditEvent[] {
    if (taskId) {
      return this.auditEvents.filter((e) => e.taskId === taskId);
    }
    return this.auditEvents;
  }
}
