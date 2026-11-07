import { Router } from 'express';
import { prisma } from '../db/client.js';
import { authenticate} from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validate, query } from '../middleware/validate.js';
import { PaginationQuery } from '@eo/contracts';
import type { Prisma } from '../db/client.js';
import { CreateTrainingAssignmentRequestSchema, Uuid ,CompleteTrainingRequestSchema } from '@eo/contracts';
import { conflict, notFound } from '../lib/errors.js';
import { writeAudit } from '../lib/audit.js';
import { z } from 'zod';
import { createTrainingAssignment } from '../services/training/assignment.js';
import { body } from '../middleware/validate.js';
import {
  createTrainingAgentGraph,
  createInitialTrainingState,
} from '../agents/training/index.js';

export const trainingRouter = Router();

trainingRouter.use(authenticate);
trainingRouter.get(
  '/training/courses',
  requirePermission('training.read'),
  validate({ query: PaginationQuery }),
  async (req, res, next) => {
    try {
      const { page, pageSize } = query<typeof PaginationQuery>(req);

      const [items, totalItems] = await Promise.all([
        prisma.trainingCourse.findMany({
          where: { isActive: true },
          orderBy: { title: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
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
        }),
        prisma.trainingCourse.count({
          where: { isActive: true },
        }),
      ]);

      res.json({
        items,
        meta: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);
trainingRouter.get(
  '/training/assignments',
  requirePermission('training.read'),
  validate({ query: PaginationQuery }),
  async (req, res, next) => {
    try {
      const { page, pageSize } = query<typeof PaginationQuery>(req);
      const actor = req.auth!;
      const scope = actor.permissions.get('training.read');

      const where: Prisma.TrainingAssignmentWhereInput = {};

      // Employees can only see their own training assignments.
      if (scope === 'SELF') {
        where.task = {
          is: {
            plan: {
              is: {
                employeeId: actor.employeeId ?? '__no_employee__',
              },
            },
          },
        };
      }

      // Managers can see assignments belonging to their direct reports.
      else if (scope === 'REPORTS') {
        where.task = {
          is: {
            plan: {
              is: {
                employee: {
                  is: {
                    managerId: actor.employeeId ?? '__no_employee__',
                  },
                },
              },
            },
          },
        };
      }

      // Department-scoped users can see assignments in their department.
      else if (scope === 'DEPARTMENT') {
        const employee = actor.employeeId
          ? await prisma.employee.findUnique({
              where: { id: actor.employeeId },
              select: { departmentId: true },
            })
          : null;

        where.task = {
          is: {
            plan: {
              is: {
                employee: {
                  is: {
                    departmentId: employee?.departmentId ?? '__no_department__',
                  },
                },
              },
            },
          },
        };
      }

      // ORG scope intentionally has no employee filter.

      const [items, totalItems] = await Promise.all([
        prisma.trainingAssignment.findMany({
          where,
          include: {
            course: {
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
            },
          },
          orderBy: { assignedAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.trainingAssignment.count({ where }),
      ]);

      res.json({
        items: items.map((assignment) => ({
          id: assignment.id,
          taskId: assignment.taskId,
          course: assignment.course,
          status: assignment.status,
          assignedAt: assignment.assignedAt.toISOString(),
          dueDate: assignment.dueDate.toISOString().slice(0, 10),
          startedAt: assignment.startedAt?.toISOString() ?? null,
          completedAt: assignment.completedAt?.toISOString() ?? null,
          scorePercent: assignment.scorePercent,
          isStatutory: assignment.course.statutoryDeadlineDays !== null,
        })),
        meta: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

// POST /plans/:planId/training/recommendations
trainingRouter.post(
  '/plans/:planId/training/recommendations',
  validate({
    params: z.object({ planId: Uuid }),
  }),
  requirePermission('training.read', {
    target: async (req) => {
      const plan = await prisma.onboardingPlan.findUnique({
        where: { id: req.params.planId as string },
        select: { employeeId: true },
      });

      return plan?.employeeId ?? null;
    },
  }),
  async (req, res, next) => {
    try {
      const { planId } = req.params as { planId: string };

      const plan = await prisma.onboardingPlan.findUnique({
        where: { id: planId },
        select: { employeeId: true },
      });

      if (!plan) {
        throw notFound('Onboarding plan');
      }

      const graph = createTrainingAgentGraph();

      const result = await graph.invoke(
        createInitialTrainingState(plan.employeeId, planId),
      );

      res.json({
        planId,
        executionStatus: result.executionStatus,
        recommendations: result.recommendations,
        validatedRecommendations: result.validatedRecommendations,
        requiresHumanReview: result.requiresHumanReview,
        reviewReason: result.reviewReason,
        errors: result.errors,
        warnings: result.warnings,
        statutoryFindings: result.statutoryFindings,
      });
    } catch (e) {
      next(e);
    }
  },
);

// POST /api/v1/tasks/:taskId/training
trainingRouter.post(
  '/tasks/:taskId/training',
  validate({
    params: z.object({ taskId: Uuid }),
    body: CreateTrainingAssignmentRequestSchema,
  }),
  requirePermission('training.assign', {
    target: async (req) => {
      const task = await prisma.planTask.findFirst({
        where: {
          id: req.params.taskId as string,
          service: 'TRAINING',
        },
        select: {
          plan: {
            select: { employeeId: true },
          },
        },
      });

      return task?.plan.employeeId ?? null;
    },
  }),
  async (req, res, next) => {
    try {
     const { taskId } = req.params as { taskId: string };

const input = req.body as {
  courseId: string;
  dueDate?: string;
};

const assignment = await createTrainingAssignment(req, {
  taskId,
  courseId: input.courseId,
  dueDate: input.dueDate,
});

res.status(201).json(assignment);
    } catch (e) {
      next(e);
    }
  },
);
// POST /tasks/:taskId/training
trainingRouter.post(
  '/tasks/:taskId/training/completion',
  validate({
    params: z.object({ taskId: Uuid }),
    body: CompleteTrainingRequestSchema,
  }),
  requirePermission('training.complete', {
    target: async (req) => {
      const assignment = await prisma.trainingAssignment.findFirst({
        where: {
          taskId: req.params.taskId as string,
          task: { service: 'TRAINING' },
        },
        select: {
          task: {
            select: {
              plan: {
                select: {
                  employeeId: true,
                },
              },
            },
          },
        },
      });

      return assignment?.task.plan.employeeId ?? null;
    },
  }),
  async (req, res, next) => {
    try {
      const { taskId } = req.params as { taskId: string };
      const input = body<typeof CompleteTrainingRequestSchema>(req);

      const assignment = await prisma.trainingAssignment.findUnique({
        where: { taskId },
        include: {
          course: {
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
          },
        },
      });

      if (!assignment) {
        throw notFound('Training assignment not found');
      }

      if (assignment.status === 'COMPLETED') {
        throw conflict('Training assignment is already completed');
      }

      const completedAt = input.completedAt
        ? new Date(input.completedAt)
        : new Date();

      const updated = await prisma.trainingAssignment.update({
        where: { taskId },
        data: {
          status: 'COMPLETED',
          completedAt,
          startedAt: assignment.startedAt ?? completedAt,
          ...(input.scorePercent !== undefined
            ? { scorePercent: input.scorePercent }
            : {}),
        },
        include: {
          course: {
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
          },
        },
      });

      await writeAudit(req, {
        action: 'training.completed',
        resourceType: 'training_assignment',
        resourceId: updated.id,
        after: {
          taskId,
          status: updated.status,
          scorePercent: updated.scorePercent,
          completedAt: updated.completedAt,
        },
      });

      res.json({
        ...updated,
        isStatutory: updated.course.statutoryDeadlineDays !== null,
      });
    } catch (e) {
      next(e);
    }
  },
);