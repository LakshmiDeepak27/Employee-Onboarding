
import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../db/client.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { Uuid } from '@eo/contracts';
import { notFound } from '../lib/errors.js';

import {
  createManagingAgentGraph,
  createInitialManagingState,
} from '../agents/managing/index.js';

export const managingRouter = Router();

managingRouter.use(authenticate);

// POST /plans/:planId/manager/recommendations
managingRouter.post(
  '/plans/:planId/manager/recommendations',

  validate({
    params: z.object({
      planId: Uuid,
    }),
  }),

  requirePermission('managertask.read', {
    target: async (req) => {
      const plan = await prisma.onboardingPlan.findUnique({
        where: {
          id: req.params.planId as string,
        },
        select: {
          employeeId: true,
        },
      });

      return plan?.employeeId ?? null;
    },
  }),

  async (req, res, next) => {
    try {
      const { planId } = req.params as {
        planId: string;
      };

      const plan = await prisma.onboardingPlan.findUnique({
        where: {
          id: planId,
        },
        select: {
          employeeId: true,
        },
      });

      if (!plan) {
        throw notFound('Onboarding plan');
      }

      const graph = createManagingAgentGraph();

      const result = await graph.invoke(
        createInitialManagingState(plan.employeeId, planId),
      );

      res.json({
        planId,
        executionStatus: result.executionStatus,
        recommendations: result.recommendations,
        blockers: result.blockers,
        requiresHumanReview: result.requiresHumanReview,
        reviewReason: result.reviewReason,
        errors: result.errors,
        warnings: result.warnings,
      });
    } catch (error) {
      next(error);
    }
  },
);
