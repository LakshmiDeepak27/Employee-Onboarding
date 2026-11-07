
import { z } from 'zod';

/**
 * Training task types supported by the existing Prisma schema.
 */
export const TRAINING_TASK_TYPES = [
  'MANDATORY_COMPLIANCE_TRAINING',
  'HEALTH_AND_SAFETY_TRAINING',
  'DATA_PROTECTION_TRAINING',
  'ROLE_SPECIFIC_TRAINING',
] as const;

export type TrainingTaskType = (typeof TRAINING_TASK_TYPES)[number];

export type EligiblePlanStatus = 'APPROVED' | 'IN_PROGRESS';

export interface TrainingEmployeeContext {
  employeeId: string;
  roleFamily: string;
  jurisdictionCode: string;
  startDate: string;
}

export interface TrainingTaskContext {
  taskId: string;
  planId: string;
  taskType: TrainingTaskType;
  title: string;
  description: string | null;
  dueDate: string;
  earliestStartDate: string;
  status: string;
}

export interface TrainingCourseContext {
  id: string;
  code: string;
  title: string;
  provider: string | null;
  durationMinutes: number;
  mandatoryForJurisdictions: string[];
  mandatoryForRoles: string[];
  statutoryDeadlineDays: number | null;
}

/**
 * Structured output expected from the LLM.
 *
 * The model can recommend only course IDs returned by our database
 * retrieval node. Deterministic validation will verify this again.
 */
export const TrainingRecommendationSchema = z.object({
  recommendations: z.array(
    z.object({
      taskId: z.string().uuid(),
      courseId: z.string().uuid(),
      coverage: z.enum(['FULL', 'PARTIAL']),
      verdict: z.enum(['ACCEPT', 'REJECT']),
      reasoning: z.string().min(1).max(1000),
    }),
  ),
  requiresHumanReview: z.boolean(),
  reviewReason: z.string().max(1000).nullable(),
});

export type TrainingRecommendation = z.infer<
  typeof TrainingRecommendationSchema
>;

export interface ValidatedTrainingRecommendation {
  taskId: string;
  courseId: string;
  coverage: 'FULL';
  verdict: 'ACCEPT';
  reasoning: string;
}

export interface TrainingAgentState {
  employeeId: string;
  planId: string;

  planStatus: string | null;
  employee: TrainingEmployeeContext | null;

  trainingTasks: TrainingTaskContext[];
  availableCourses: TrainingCourseContext[];

  recommendations: TrainingRecommendation['recommendations'];
  validatedRecommendations: ValidatedTrainingRecommendation[];

  assignmentsCreated: string[];

    errors: string[];
    warnings: string[];
    statutoryFindings: string[];

  requiresHumanReview: boolean;
  reviewReason: string | null;

  executionStatus:
    | 'PENDING'
    | 'VALIDATING'
    | 'RECOMMENDING'
    | 'ASSIGNING'
    | 'COMPLETED'
    | 'FAILED'
    | 'NEEDS_REVIEW';
}
