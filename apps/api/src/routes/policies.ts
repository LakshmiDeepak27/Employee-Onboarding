import { Router } from "express";
import { prisma, isDatabaseOnline, setDatabaseOnline } from "../db/client.js";
import { ListPoliciesQuerySchema, z } from "@eo/contracts";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { notFound } from "../lib/errors.js";

export const policiesRouter = Router();
policiesRouter.use(authenticate);
// GET /api/v1/policies
policiesRouter.get(
  "/",
  requirePermission("policy.read"),
  validate({ query: ListPoliciesQuerySchema }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof ListPoliciesQuerySchema>;

      const where: any = {
        ...(q.jurisdictionCode ? { jurisdictionCode: q.jurisdictionCode } : {}),
        ...(q.category ? { category: q.category } : {}),
        ...(q.search
          ? {
              OR: [
                { title: { contains: q.search, mode: "insensitive" } },
                {
                  clauses: {
                    some: { body: { contains: q.search, mode: "insensitive" } },
                  },
                },
              ],
            }
          : {}),
      };

      let items: any[] = [];
      let totalItems = 0;

      if (isDatabaseOnline()) {
        try {
          const [dbItems, count] = await Promise.all([
            prisma.policyDocument.findMany({
              where,
              include: {
                _count: { select: { clauses: true } },
              },
              orderBy: { title: "asc" },
              skip: (q.page - 1) * q.pageSize,
              take: q.pageSize,
            }),
            prisma.policyDocument.count({ where }),
          ]);
          items = dbItems;
          totalItems = count;
        } catch {
          setDatabaseOnline(false);
        }
      }

      res.json({
        items: items.map((d) => ({
          id: d.id,
          jurisdictionCode: d.jurisdictionCode,
          title: d.title,
          category: d.category,
          sourceUri: d.sourceUri,
          version: d.version,
          effectiveFrom: d.effectiveFrom.toISOString().slice(0, 10),
          isMock: d.isMock,
          clauseCount: d._count.clauses,
        })),
        meta: {
          page: q.page,
          pageSize: q.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / q.pageSize) || 1,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);
// Clause handler reusable for both /api/v1/policies/clauses/:clauseId and /api/v1/clauses/:clauseId
export const getClauseHandler = async (req: any, res: any, next: any) => {
  try {
    let clause: any = null;
    if (isDatabaseOnline()) {
      try {
        clause = await prisma.policyClause.findUnique({
          where: { id: req.params.clauseId },
          include: { document: { select: { title: true, isMock: true } } },
        });
      } catch {
        setDatabaseOnline(false);
        clause = null;
      }
    }

    if (!clause) throw notFound(`Policy clause '${req.params.clauseId}'`);

    res.json({
      id: clause.id,
      documentId: clause.documentId,
      documentTitle: clause.document.title,
      jurisdictionCode: clause.jurisdictionCode,
      heading: clause.heading,
      body: clause.body,
      topics: clause.topics ?? [],
      isMock: clause.document.isMock,
      highlight: null,
    });
  } catch (e) {
    next(e);
  }
};

// GET /api/v1/policies/clauses/:clauseId
policiesRouter.get(
  "/clauses/:clauseId",
  requirePermission("policy.read"),
  getClauseHandler,
);

// GET /api/v1/clauses/:clauseId (matches OpenAPI contract)
export const clausesRouter = Router();
clausesRouter.use(authenticate);
clausesRouter.get(
  "/:clauseId",
  requirePermission("policy.read"),
  getClauseHandler,
);
