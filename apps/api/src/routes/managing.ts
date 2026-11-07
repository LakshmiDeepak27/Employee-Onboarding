import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { Uuid } from '@eo/contracts';
import { notFound } from '../lib/errors.js';
import { generateManagerRecommendations } from '../services/managing/managing-service.js';

export const managingRouter = Router();

managingRouter.use(authenticate);

// POST /api/v1/plans/:planId/manager/recommendations
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

      const result = await generateManagerRecommendations(planId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

