
import { prisma } from '../../db/client.js';
import {
  MANAGER_ACTION_TYPES,
  type ManagingEmployeeContext,
  type ExistingManagerTaskContext,
} from './state.js';

/**
 * Loads an onboarding plan and the employee context needed
 * to create a manager action plan.
 *
 * Only APPROVED and IN_PROGRESS plans can enter the Managing Agent.
 */
export async function loadManagingPlanContext(
  employeeId: string,
  planId: string,
): Promise<{
  planStatus: string;
  employee: ManagingEmployeeContext;
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
          jobTitle: true,
          roleFamily: true,
          departmentId: true,
          managerId: true,
          employmentType: true,
          workMode: true,
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
      `Managing Agent cannot run for a plan with status ${plan.status}.`,
    );
  }

  return {
    planStatus: plan.status,
    employee: {
      employeeId: plan.employee.id,
      jobTitle: plan.employee.jobTitle,
      roleFamily: plan.employee.roleFamily,
      departmentId: plan.employee.departmentId,
      managerId: plan.employee.managerId,
      employmentType: plan.employee.employmentType,
      workMode: plan.employee.workMode,
      jurisdictionCode: plan.employee.jurisdictionCode,
      startDate: plan.employee.startDate.toISOString().slice(0, 10),
    },
  };
}

/**
 * Retrieves existing manager-related tasks for the supplied plan.
 *
 * The agent uses these tasks to avoid recommending duplicate actions.
 * It does not create, assign, approve, or dispatch tasks.
 */
export async function loadExistingManagerTasks(
  planId: string,
): Promise<ExistingManagerTaskContext[]> {
  const tasks = await prisma.planTask.findMany({
    where: {
      planId,
      service: 'MANAGER',
      taskType: {
        in: [...MANAGER_ACTION_TYPES],
      },
    },
    orderBy: {
      sortOrder: 'asc',
    },
    select: {
      id: true,
      taskType: true,
      title: true,
      description: true,
      ownerRole: true,
      dueDate: true,
      earliestStartDate: true,
      status: true,
    },
  });

  return tasks.map((task) => ({
    taskId: task.id,
    taskType: task.taskType as ExistingManagerTaskContext['taskType'],
    title: task.title,
    description: task.description,
    ownerRole: task.ownerRole,
    dueDate: task.dueDate.toISOString().slice(0, 10),
    earliestStartDate: task.earliestStartDate.toISOString().slice(0, 10),
    status: task.status,
  }));
}
