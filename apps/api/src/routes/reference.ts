import { Router } from "express";
import { prisma, isDatabaseOnline, setDatabaseOnline } from "../db/client.js";
import { authenticate } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/authorize.js";

export const referenceRouter = Router();

referenceRouter.use(authenticate);

/**
 * `hasPolicyCorpus: false` means plan generation will REFUSE for that
 * location. The intake form reads this so HR is warned before submitting,
 * not after.
 */
referenceRouter.get("/jurisdictions", async (_req, res, _next) => {
  if (isDatabaseOnline()) {
    try {
      const rows = await prisma.jurisdiction.findMany({
        orderBy: { code: "asc" },
        select: {
          code: true,
          displayName: true,
          countryCode: true,
          businessDays: true,
          timezone: true,
          _count: { select: { policyClauses: true } },
        },
      });
      if (rows.length > 0) {
        return res.json(
          rows.map((j) => ({
            code: j.code,
            displayName: j.displayName,
            countryCode: j.countryCode,
            businessDays: j.businessDays,
            timezone: j.timezone,
            hasPolicyCorpus: j._count.policyClauses > 0,
          })),
        );
      }
    } catch {
      setDatabaseOnline(false);
    }
  }

  return res.json([
    {
      code: "CA-ON",
      displayName: "Ontario, Canada",
      countryCode: "CA",
      businessDays: [1, 2, 3, 4, 5],
      timezone: "America/Toronto",
      hasPolicyCorpus: true,
    },
    {
      code: "GB",
      displayName: "United Kingdom",
      countryCode: "GB",
      businessDays: [1, 2, 3, 4, 5],
      timezone: "Europe/London",
      hasPolicyCorpus: true,
    },
    {
      code: "IN-KA",
      displayName: "Karnataka, India",
      countryCode: "IN",
      businessDays: [1, 2, 3, 4, 5],
      timezone: "Asia/Kolkata",
      hasPolicyCorpus: true,
    },
    {
      code: "SG",
      displayName: "Singapore",
      countryCode: "SG",
      businessDays: [1, 2, 3, 4, 5],
      timezone: "Asia/Singapore",
      hasPolicyCorpus: false,
    },
  ]);
});

referenceRouter.get("/departments", async (_req, res, _next) => {
  if (isDatabaseOnline()) {
    try {
      const deps = await prisma.department.findMany({
        orderBy: { name: "asc" },
        select: { id: true, code: true, name: true },
      });
      if (deps.length > 0) return res.json(deps);
    } catch {
      setDatabaseOnline(false);
    }
  }

  return res.json([
    { id: "dept-eng", code: "ENG", name: "Engineering" },
    { id: "dept-prod", code: "PROD", name: "Product" },
    { id: "dept-sales", code: "SALES", name: "Sales & Marketing" },
    { id: "dept-hr", code: "HR", name: "People Operations" },
  ]);
});

referenceRouter.get(
  "/policies/coverage",
  requirePermission("policy.read"),
  async (_req, res, _next) => {
    if (isDatabaseOnline()) {
      try {
        const jurisdictions = await prisma.jurisdiction.findMany({
          select: {
            code: true,
            displayName: true,
            _count: { select: { policyDocuments: true, policyClauses: true } },
            policyDocuments: { select: { category: true } },
          },
          orderBy: { code: "asc" },
        });
        if (jurisdictions.length > 0) {
          return res.json(
            jurisdictions.map((j) => ({
              jurisdictionCode: j.code,
              displayName: j.displayName,
              documentCount: j._count.policyDocuments,
              clauseCount: j._count.policyClauses,
              categories: [
                ...new Set(j.policyDocuments.map((d) => d.category)),
              ].sort(),
              isSupported: j._count.policyClauses > 0,
            })),
          );
        }
      } catch {
        setDatabaseOnline(false);
      }
    }

    return res.json([
      {
        jurisdictionCode: "CA-ON",
        displayName: "Ontario, Canada",
        documentCount: 2,
        clauseCount: 12,
        categories: ["COMPLIANCE", "TAX"],
        isSupported: true,
      },
      {
        jurisdictionCode: "GB",
        displayName: "United Kingdom",
        documentCount: 1,
        clauseCount: 8,
        categories: ["COMPLIANCE", "EMPLOYMENT"],
        isSupported: true,
      },
      {
        jurisdictionCode: "IN-KA",
        displayName: "Karnataka, India",
        documentCount: 1,
        clauseCount: 10,
        categories: ["COMPLIANCE", "STATUTORY"],
        isSupported: true,
      },
      {
        jurisdictionCode: "SG",
        displayName: "Singapore",
        documentCount: 0,
        clauseCount: 0,
        categories: [],
        isSupported: false,
      },
    ]);
  },
);
