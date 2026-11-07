import { prisma } from '../../db/client.js';
import {
  MANAGER_ACTION_TYPES,
  ManagerActionRecommendation,
  ManagingAgentOutput,
} from '@eo/contracts';

export interface ManagingPlanContext {
  planId: string;
  employeeId: string;
  employeeName: string;
  departmentId: string | null;
  departmentName?: string | null;
  managerId: string | null;
  managerName?: string | null;
  startDate: string;
  jobTitle: string;
}

export async function generateManagerRecommendations(planId: string): Promise<
  ManagingAgentOutput & {
    planId: string;
    blockers: string[];
    warnings: string[];
    errors: string[];
    executionStatus: string;
  }
> {
  const plan = await prisma.onboardingPlan.findUnique({
    where: { id: planId },
    include: {
      employee: {
        include: {
          department: true,
          manager: true,
        },
      },
      tasks: {
        where: { service: 'MANAGER' },
      },
    },
  });

  if (!plan) {
    throw new Error('Onboarding plan not found');
  }

  const { employee } = plan;
  const blockers: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  let requiresHumanReview = false;
  const reviewReasons: string[] = [];

  if (!employee.managerId) {
    blockers.push('No manager is currently assigned to this employee.');
    requiresHumanReview = true;
    reviewReasons.push(
      'No manager is assigned to this employee. Manager ownership must be resolved.',
    );
  }

  if (!employee.departmentId) {
    blockers.push('Department assignment is missing.');
    warnings.push(
      'Employee is not assigned to a department; team onboarding agenda will use generic templates.',
    );
  }

  const recommendations: ManagerActionRecommendation[] = [
    {
      taskType: 'ASSIGN_BUDDY',
      action: `Assign an onboarding peer buddy from ${employee.department?.name ?? 'the team'} within 3 days.`,
      reasoning:
        'Peer buddies reduce first-week friction and help new hires navigate day-to-day tooling and culture.',
      priority: 'HIGH',
      suggestedTiming: 'BEFORE_START_DATE',
      dependencies: [],
      blockers: employee.managerId ? [] : ['Manager assignment missing'],
      requiresHumanReview: !employee.managerId,
    },
    {
      taskType: 'PREPARE_DAY_ONE_AGENDA',
      action: `Prepare Day 1 agenda including 9:30 AM welcome 1:1, team intro lunch, and laptop setup sync.`,
      reasoning:
        'Structured first day ensures psychological safety and zero downtime on start date.',
      priority: 'URGENT',
      suggestedTiming: 'DAY_ONE',
      dependencies: ['ASSIGN_BUDDY'],
      blockers: [],
      requiresHumanReview: false,
    },
    {
      taskType: 'APPROVE_SYSTEM_ACCESS',
      action: `Review and approve core software licenses and departmental repo access for ${employee.jobTitle}.`,
      reasoning:
        'Prevents security bottlenecks while adhering to least-privilege access principles.',
      priority: 'HIGH',
      suggestedTiming: 'FIRST_WEEK',
      dependencies: [],
      blockers: [],
      requiresHumanReview: false,
    },
    {
      taskType: 'SCHEDULE_INTRO_MEETINGS',
      action: `Schedule 30-minute introductory meetings with cross-functional team leads and key stakeholders.`,
      reasoning:
        'Early stakeholder visibility accelerates ramp-up and cross-department collaboration.',
      priority: 'MEDIUM',
      suggestedTiming: 'FIRST_WEEK',
      dependencies: ['PREPARE_DAY_ONE_AGENDA'],
      blockers: [],
      requiresHumanReview: false,
    },
    {
      taskType: 'SET_PROBATION_GOALS',
      action: `Define and document 30-day, 60-day, and 90-day success metrics and probation milestones.`,
      reasoning:
        'Clear goals establish objective alignment and set unambiguous performance expectations.',
      priority: 'HIGH',
      suggestedTiming: 'FIRST_30_DAYS',
      dependencies: ['SCHEDULE_INTRO_MEETINGS'],
      blockers: [],
      requiresHumanReview: false,
    },
  ];

  return {
    planId,
    executionStatus: 'COMPLETED',
    recommendations,
    blockers,
    warnings,
    errors,
    requiresHumanReview,
    reviewReason: reviewReasons.length > 0 ? reviewReasons.join(' ') : null,
  };
}
