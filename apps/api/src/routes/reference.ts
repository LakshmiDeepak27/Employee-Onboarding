import { Router } from 'express';
import { prisma } from '../db/client.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';

export const referenceRouter = Router();

referenceRouter.use(authenticate);

/**
 * `hasPolicyCorpus: false` means plan generation will REFUSE for that
 * location. The intake form reads this so HR is warned before submitting,
 * not after.
 */
referenceRouter.get('/jurisdictions', async (_req, res, next) => {
  try {
    const rows = await prisma.jurisdiction.findMany({
      orderBy: { code: 'asc' },
      select: {
        code: true,
        displayName: true,
        countryCode: true,
        businessDays: true,
        timezone: true,
        _count: { select: { policyClauses: true } },
      },
    });
    res.json(
      rows.map((j) => ({
        code: j.code,
        displayName: j.displayName,
        countryCode: j.countryCode,
        businessDays: j.businessDays,
        timezone: j.timezone,
        hasPolicyCorpus: j._count.policyClauses > 0,
      })),
    );
  } catch (e) {
    next(e);
  }
});

referenceRouter.get('/departments', async (_req, res, next) => {
  try {
    res.json(
      await prisma.department.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true },
      }),
    );
  } catch (e) {
    next(e);
  }
});

referenceRouter.get(
  '/policies/coverage',
  requirePermission('policy.read'),
  async (_req, res, next) => {
    try {
      const jurisdictions = await prisma.jurisdiction.findMany({
        select: {
          code: true,
          displayName: true,
          _count: { select: { policyDocuments: true, policyClauses: true } },
          policyDocuments: { select: { category: true } },
        },
        orderBy: { code: 'asc' },
      });
      res.json(
        jurisdictions.map((j) => ({
          jurisdictionCode: j.code,
          displayName: j.displayName,
          documentCount: j._count.policyDocuments,
          clauseCount: j._count.policyClauses,
          categories: [...new Set(j.policyDocuments.map((d) => d.category))].sort(),
          isSupported: j._count.policyClauses > 0,
        })),
      );
    } catch (e) {
      next(e);
    }
  },
);
