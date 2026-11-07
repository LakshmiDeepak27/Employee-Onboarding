import { Router } from "express";
import { prisma, isDatabaseOnline, setDatabaseOnline } from "../db/client.js";
import { CreatePolicyDocumentRequestSchema, ListPoliciesQuerySchema, z } from "@eo/contracts";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { badRequest, notFound } from "../lib/errors.js";
import { writeAudit } from "../lib/audit.js";

export const policiesRouter = Router();
policiesRouter.use(authenticate);
policiesRouter.post(
  "/",
  requirePermission("policy.write"),
  validate({ body: CreatePolicyDocumentRequestSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof CreatePolicyDocumentRequestSchema>;
      const clauseIds = body.clauses.map((clause) => clause.id);
      if (new Set(clauseIds).size !== clauseIds.length) {
        throw badRequest("Clause IDs must be unique within a policy document.");
      }
      const document = await prisma.policyDocument.create({
        data: {
          jurisdictionCode: body.jurisdictionCode,
          title: body.title,
          category: body.category,
          sourceUri: body.sourceUri,
          version: body.version,
          effectiveFrom: new Date(`${body.effectiveFrom}T00:00:00.000Z`),
          isMock: false,
          clauses: {
            create: body.clauses.map((clause) => ({
              id: clause.id,
              jurisdictionCode: clause.jurisdictionCode,
              heading: clause.heading,
              body: clause.body,
              topics: clause.topics,
            })),
          },
        },
        include: { _count: { select: { clauses: true } } },
      });
      await writeAudit(req, {
        action: "policy.document_created",
        resourceType: "PolicyDocument",
        resourceId: document.id,
        after: {
          title: document.title,
          jurisdictionCode: document.jurisdictionCode,
          version: document.version,
          clauseCount: document._count.clauses,
        },
      });
      res.status(201).json({
        id: document.id,
        jurisdictionCode: document.jurisdictionCode,
        title: document.title,
        category: document.category,
        sourceUri: document.sourceUri,
        version: document.version,
        effectiveFrom: document.effectiveFrom.toISOString().slice(0, 10),
        isMock: document.isMock,
        clauseCount: document._count.clauses,
      });
    } catch (error) {
      next(error);
    }
  },
);
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
