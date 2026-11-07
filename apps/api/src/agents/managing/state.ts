
import { z } from 'zod';

/**
 * Closed vocabulary of manager actions.
 * These values must match the existing Prisma TaskType enum.
 */
export const MANAGER_ACTION_TYPES = [
  'ASSIGN_BUDDY',
  'PREPARE_DAY_ONE_AGENDA',
  'SCHEDULE_INTRO_MEETINGS',
  'APPROVE_SYSTEM_ACCESS',
  'SET_PROBATION_GOALS',
] as const;

export type ManagerActionType =
  (typeof MANAGER_ACTION_TYPES)[number];

/**
 * Priority represents the urgency of the manager action.
 */
export const ManagerPrioritySchema = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
]);

export type ManagerPriority = z.infer<
  typeof ManagerPrioritySchema
>;

/**
 * Relative timing, not an LLM-generated calendar date.
 * Actual dates will be calculated and validated separately.
 */
export const ManagerTimingSchema = z.enum([
  'BEFORE_START_DATE',
  'DAY_ONE',
  'FIRST_WEEK',
  'FIRST_30_DAYS',
]);

export type ManagerTiming = z.infer<
  typeof ManagerTimingSchema
>;

/**
 * Structured recommendation returned by the LLM.
 */
export const ManagerActionRecommendationSchema = z.object({
  taskType: z.enum(MANAGER_ACTION_TYPES),

  action: z.string().min(1).max(500),

  reasoning: z.string().min(1).max(1000),

  priority: ManagerPrioritySchema,

  suggestedTiming: ManagerTimingSchema,

  dependencies: z.array(
    z.enum(MANAGER_ACTION_TYPES),
  ),

  blockers: z.array(
    z.string().min(1).max(500),
  ),

  requiresHumanReview: z.boolean(),
});

export const ManagingAgentOutputSchema = z.object({
  recommendations: z.array(
    ManagerActionRecommendationSchema,
  ),

  requiresHumanReview: z.boolean(),

  reviewReason: z.string().max(1000).nullable(),
});

export type ManagerActionRecommendation = z.infer<
  typeof ManagerActionRecommendationSchema
>;

export type ManagingAgentOutput = z.infer<
  typeof ManagingAgentOutputSchema
>;

/**
 * Employee context required for manager action planning.
 */
export interface ManagingEmployeeContext {
  employeeId: string;
  jobTitle: string;
  roleFamily: string;
  departmentId: string | null;
  managerId: string | null;
  employmentType: string;
  workMode: string;
  jurisdictionCode: string;
  startDate: string;
}

/**
 * Existing manager-related onboarding tasks.
 */
export interface ExistingManagerTaskContext {
  taskId: string;
  taskType: ManagerActionType;
  title: string;
  description: string | null;
  ownerRole: string;
  dueDate: string;
  earliestStartDate: string;
  status: string;
}

/**
 * Complete LangGraph state.
 */
export interface ManagingAgentState {
  employeeId: string;
  planId: string;

  planStatus: string | null;

  employee: ManagingEmployeeContext | null;

  managerTasks: ExistingManagerTaskContext[];

  recommendations: ManagerActionRecommendation[];

  errors: string[];
  warnings: string[];
  blockers: string[];

  requiresHumanReview: boolean;
  reviewReason: string | null;

  executionStatus:
    | 'PENDING'
    | 'ANALYZING'
    | 'PLANNING'
    | 'VALIDATING'
    | 'COMPLETED'
    | 'NEEDS_REVIEW'
    | 'FAILED';
}
