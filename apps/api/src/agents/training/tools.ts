
import { prisma } from '../../db/client.js';
import type {
  TrainingCourseContext,
  TrainingEmployeeContext,
  TrainingTaskContext,
} from './state.js';

/**
 * Loads an onboarding plan and its employee context.
 *
 * Only APPROVED and IN_PROGRESS plans can enter the Training Agent.
 */
export async function loadTrainingPlanContext(
  employeeId: string,
  planId: string,
): Promise<{
  planStatus: string;
  employee: TrainingEmployeeContext;
}> {
  const plan = await prisma.onboardingPlan.findFirst({
    where: {
      id: planId,
      employeeId,
    },
    select: {
      status: true,
      employee: {
        select: {
          id: true,
          roleFamily: true,
          jurisdictionCode: true,
          startDate: true,
        },
      },
    },
  });

  if (!plan) {
    throw new Error('Onboarding plan not found for this employee.');
  }

  if (!['APPROVED', 'IN_PROGRESS'].includes(plan.status)) {
    throw new Error(
      `Training cannot run for a plan with status ${plan.status}.`,
    );
  }

  return {
    planStatus: plan.status,
    employee: {
      employeeId: plan.employee.id,
      roleFamily: plan.employee.roleFamily,
      jurisdictionCode: plan.employee.jurisdictionCode,
      startDate: plan.employee.startDate.toISOString().slice(0, 10),
    },
  };
}

/**
 * Retrieves only training tasks belonging to the supplied plan.
 */
export async function loadTrainingTasks(
  planId: string,
): Promise<TrainingTaskContext[]> {
  const tasks = await prisma.planTask.findMany({
    where: {
      planId,
      service: 'TRAINING',
    },
    orderBy: {
      sortOrder: 'asc',
    },
    select: {
      id: true,
      planId: true,
      taskType: true,
      title: true,
      description: true,
      dueDate: true,
      earliestStartDate: true,
      status: true,
    },
  });

  return tasks.map((task) => ({
    taskId: task.id,
    planId: task.planId,
    taskType: task.taskType as TrainingTaskContext['taskType'],
    title: task.title,
    description: task.description,
    dueDate: task.dueDate.toISOString().slice(0, 10),
    earliestStartDate: task.earliestStartDate.toISOString().slice(0, 10),
    status: task.status,
  }));
}

/**
 * Retrieves the active course catalogue.
 *
 * Eligibility is checked separately by deterministic validation.
 */
export async function loadActiveTrainingCourses(): Promise<
  TrainingCourseContext[]
> {
  const courses = await prisma.trainingCourse.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      title: 'asc',
    },
    select: {
      id: true,
      code: true,
      title: true,
      provider: true,
      durationMinutes: true,
      mandatoryForJurisdictions: true,
      mandatoryForRoles: true,
      statutoryDeadlineDays: true,
    },
  });

  return courses;
}
