import { Router, type Request } from "express";
import {
  employeeIdsInScope,
  employeeIdForTask,
  employeeIdForDocument,
  isEmployeeInScope,
} from "../rbac/scope.js";
import {
  storeUpload,
  readUpload,
  parseUpload,
} from "../lib/documentStorage.js";
import { prisma, isDatabaseOnline, setDatabaseOnline } from "../db/client.js";
import {
  PaginationQuery,
  VerifyDocumentRequestSchema,
  CreateEquipmentAssignmentRequestSchema,
  UpdateEquipmentAssignmentRequestSchema,
  UpsertPayrollSetupRequestSchema,
  VerifyPayrollRequestSchema,
  ElectBenefitRequestSchema,
  CreateTrainingAssignmentRequestSchema,
  CompleteTrainingRequestSchema,
  UpsertManagerTaskRequestSchema,
  z,
} from "@eo/contracts";
import { authenticate, requireAuth } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { notFound, badRequest, conflict } from "../lib/errors.js";
import { writeAudit } from "../lib/audit.js";
import { orchestrator } from "../orchestration/orchestrator.js";
import { uploadRateLimit } from "../middleware/rateLimit.js";
import { notifyUsers } from "../lib/notifications.js";

export const workflowRouter = Router();
workflowRouter.use(authenticate);

const resourceModels = {
  "document-requests": "documentRequest",
  "equipment/assignments": "equipmentAssignment",
  "benefits/enrollments": "benefitEnrollment",
  "training/assignments": "trainingAssignment",
} as const;
const managerKindByTaskType: Record<string, string> = {
  ASSIGN_BUDDY: "BUDDY_ASSIGNMENT",
  PREPARE_DAY_ONE_AGENDA: "DAY_ONE_AGENDA",
  SCHEDULE_INTRO_MEETINGS: "INTRO_MEETINGS",
  APPROVE_SYSTEM_ACCESS: "ACCESS_APPROVAL",
  SET_PROBATION_GOALS: "PROBATION_GOALS",
};
workflowRouter.use(async (req, _res, next) => {
  try {
    const actor = requireAuth(req);
    let taskId: string | undefined;
    let employeeId: string | null = null;
    const taskMatch = req.path.match(
      /^\/tasks\/([^/]+)\/(payroll|manager|equipment|training|benefits)/,
    );
    if (taskMatch) taskId = taskMatch[1];
    const docMatch = req.path.match(/^\/documents\/([^/]+)\/content/);
    if (docMatch) employeeId = await employeeIdForDocument(docMatch[1]!);
    for (const [prefix, model] of Object.entries(resourceModels)) {
      const match = req.path.match(new RegExp("^/" + prefix + "/([^/]+)"));
      if (match) {
        const row = await ((prisma as any)[model] as any).findUnique({
          where: { id: match[1] },
          select: { taskId: true },
        });
        if (!row) throw notFound();
        taskId = row.taskId;
      }
    }
    if (taskId) employeeId = await employeeIdForTask(taskId);
    if (taskId || docMatch) {
      const prefix = req.path.includes("payroll")
        ? "payroll"
        : req.path.includes("equipment")
          ? "equipment"
          : req.path.includes("benefit")
            ? "benefit"
            : req.path.includes("training")
              ? "training"
              : req.path.includes("manager")
                ? "managertask"
                : "document";
      const permissionKey =
        req.path.endsWith("/receipt") && prefix === "equipment"
          ? "equipment.receipt"
          : req.method === "GET"
            ? undefined
            : actor.permissions.get(prefix + ".write");
      const scope =
        (permissionKey ? actor.permissions.get(permissionKey) : undefined) ??
        actor.permissions.get(prefix + ".read");
      if (
        !scope ||
        !employeeId ||
        !(await isEmployeeInScope(actor, scope, employeeId))
      )
        throw notFound();
      // Service routes are separate authorization boundaries. A manager must
      // never update a plan task owned by IT, payroll, benefits, etc.
      if (taskId && prefix === "managertask") {
        const task = await prisma.planTask.findUnique({
          where: { id: taskId },
          select: { service: true },
        });
        if (!task || task.service !== "MANAGER") throw notFound();
      }
      if (req.method !== "GET" && taskId) {
        const task = await prisma.planTask.findUnique({
          where: { id: taskId },
          include: {
            plan: true,
            dependencies: { include: { dependsOn: true } },
          },
        });
        if (!task || !["APPROVED", "IN_PROGRESS"].includes(task.plan.status))
          throw conflict("The plan must be approved before workflow actions.");
        if (
          task.dependencies.some(
            (d) => !["COMPLETED", "SKIPPED"].includes(d.dependsOn.status),
          )
        )
          throw conflict("Complete the prerequisite tasks first.");
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});
async function scopedServiceWhere(req: Request, permission: string) {
  const actor = requireAuth(req);
  const reach = await employeeIdsInScope(
    actor,
    actor.permissions.get(permission) ?? "SELF",
  );
  return reach.all ? {} : { task: { plan: { employeeId: { in: reach.ids } } } };
}
// 1. DOCUMENTS

// GET /api/v1/document-requests
workflowRouter.get(
  "/document-requests",
  requirePermission("document.read"),
  validate({ query: PaginationQuery }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof PaginationQuery>;

      let items: any[] = [];
      let totalItems = 0;
      if (isDatabaseOnline()) {
        try {
          const [dbItems, count] = await Promise.all([
            prisma.documentRequest.findMany({
              where: await scopedServiceWhere(req, "document.read"),
              include: {
                document: true,
                verifiedBy: { select: { email: true } },
              },
              orderBy: { createdAt: "desc" },
              skip: (q.page - 1) * q.pageSize,
              take: q.pageSize,
            }),
            prisma.documentRequest.count({
              where: await scopedServiceWhere(req, "document.read"),
            }),
          ]);
          items = dbItems;
          totalItems = count;
        } catch {
          setDatabaseOnline(false);
          items = [];
          totalItems = 0;
        }
      }

      res.json({
        items: items.map((r) => ({
          id: r.id,
          taskId: r.taskId,
          documentType: r.documentType,
          isRequired: r.isRequired,
          status: r.status,
          document: r.document
            ? {
                id: r.document.id,
                employeeId: r.document.employeeId,
                fileName: r.document.fileName,
                mimeType: r.document.mimeType,
                sizeBytes: r.document.sizeBytes,
                checksum: r.document.checksum,
                uploadedByName: null,
                uploadedAt: r.document.uploadedAt.toISOString(),
                downloadUrl: `/api/v1/documents/${r.document.id}/content`,
              }
            : null,
          verifiedByName: r.verifiedBy?.email ?? null,
          verifiedAt: r.verifiedAt?.toISOString() ?? null,
          rejectionReason: r.rejectionReason,
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

// POST /api/v1/document-requests/:id/upload
workflowRouter.post(
  "/document-requests/:id/upload",
  uploadRateLimit,
  requirePermission("document.upload"),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const reqRow = await prisma.documentRequest.findUnique({
        where: { id: req.params.id },
        include: { task: { include: { plan: true } } },
      });
      if (!reqRow) throw notFound("Document request");

      if (!["REQUESTED", "REJECTED"].includes(reqRow.status))
        throw conflict("This request already has a submission.");
      const file = parseUpload(req.body);
      const stored = await storeUpload(file);
      const { fileName, mimeType } = file;
      const { doc, updatedReq } = await prisma.$transaction(async (tx) => {
        const doc = await tx.document.create({
          data: {
            employeeId: reqRow.task.plan.employeeId,
            fileName,
            mimeType,
            sizeBytes: file.bytes.length,
            storagePath: stored.path,
            checksum: stored.checksum,
            uploadedById: actor.userId,
          },
        });
        const updatedReq = await tx.documentRequest.update({
          where: { id: reqRow.id },
          data: { documentId: doc.id, status: "UPLOADED" },
        });
        return { doc, updatedReq };
      });

      // Update task status to IN_PROGRESS
      await orchestrator.updateTask(
        reqRow.task.planId,
        reqRow.taskId,
        { status: "IN_PROGRESS" },
        { userId: actor.userId, role: actor.roles.join(",") },
      );

      await writeAudit(req, {
        action: "document.uploaded",
        resourceType: "DocumentRequest",
        resourceId: req.params.id,
        after: { documentId: doc.id, fileName },
      });

      res.status(200).json({
        id: updatedReq.id,
        taskId: updatedReq.taskId,
        documentType: updatedReq.documentType,
        isRequired: updatedReq.isRequired,
        status: updatedReq.status,
        document: {
          id: doc.id,
          employeeId: doc.employeeId,
          fileName: doc.fileName,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          checksum: doc.checksum,
          uploadedByName: actor.email,
          uploadedAt: doc.uploadedAt.toISOString(),
          downloadUrl: `/api/v1/documents/${doc.id}/content`,
        },
        verifiedByName: null,
        verifiedAt: null,
        rejectionReason: null,
      });
    } catch (e) {
      next(e);
    }
  },
);

// POST /api/v1/document-requests/:id/verify
workflowRouter.post(
  "/document-requests/:id/verify",
  requirePermission("document.verify"),
  validate({ body: VerifyDocumentRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const b = req.body as z.infer<typeof VerifyDocumentRequestSchema>;

      const reqRow = await prisma.documentRequest.findUnique({
        where: { id: req.params.id },
        include: { task: true },
      });
      if (!reqRow) throw notFound("Document request");

      if (reqRow.status !== "UPLOADED" || !reqRow.documentId)
        throw conflict("Upload a document before verification.");
      const isVerified = b.decision === "VERIFY";

      const updated = await prisma.documentRequest.update({
        where: { id: req.params.id },
        data: {
          status: isVerified ? "VERIFIED" : "REJECTED",
          verifiedById: actor.userId,
          verifiedAt: new Date(),
          rejectionReason: isVerified
            ? null
            : (b.rejectionReason ?? "Document rejected by reviewer"),
        },
        include: { document: true },
      });

      // If verified, mark corresponding plan task as COMPLETED
      if (isVerified) {
        await orchestrator.updateTask(
          reqRow.task.planId,
          reqRow.taskId,
          { status: "COMPLETED" },
          { userId: actor.userId, role: actor.roles.join(",") },
        );
      } else {
        await orchestrator.updateTask(
          reqRow.task.planId,
          reqRow.taskId,
          { status: "BLOCKED" },
          { userId: actor.userId, role: actor.roles.join(",") },
        );
      }

      await writeAudit(req, {
        action: isVerified ? "document.verified" : "document.rejected",
        resourceType: "DocumentRequest",
        resourceId: req.params.id,
        after: { decision: b.decision, reason: b.rejectionReason },
      });

      res.json({
        id: updated.id,
        taskId: updated.taskId,
        documentType: updated.documentType,
        isRequired: updated.isRequired,
        status: updated.status,
        document: updated.document
          ? {
              id: updated.document.id,
              employeeId: updated.document.employeeId,
              fileName: updated.document.fileName,
              mimeType: updated.document.mimeType,
              sizeBytes: updated.document.sizeBytes,
              checksum: updated.document.checksum,
              uploadedByName: null,
              uploadedAt: updated.document.uploadedAt.toISOString(),
              downloadUrl: `/api/v1/documents/${updated.document.id}/content`,
            }
          : null,
        verifiedByName: actor.email,
        verifiedAt: updated.verifiedAt?.toISOString() ?? null,
        rejectionReason: updated.rejectionReason,
      });
    } catch (e) {
      next(e);
    }
  },
);

// GET /api/v1/documents/:id/content
workflowRouter.get(
  "/documents/:id/content",
  requirePermission("document.read"),
  async (req, res, next) => {
    try {
      const doc = await prisma.document.findUnique({
        where: { id: req.params.id },
      });
      if (!doc) throw notFound("Document");

      res.setHeader("Content-Type", doc.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      );
      res.send(await readUpload(doc.storagePath));
    } catch (e) {
      next(e);
    }
  },
);
// 2. EQUIPMENT

// GET /api/v1/equipment/catalog
workflowRouter.get(
  "/equipment/catalog",
  requirePermission("equipment.read"),
  async (_req, res, next) => {
    try {
      const items = await prisma.equipmentCatalog.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
      res.json(items);
    } catch (e) {
      next(e);
    }
  },
);

// GET /api/v1/equipment/assignments
workflowRouter.get(
  "/equipment/assignments",
  requirePermission("equipment.read"),
  validate({ query: PaginationQuery }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof PaginationQuery>;

      let items: any[] = [];
      let totalItems = 0;
      if (isDatabaseOnline()) {
        try {
          const [dbItems, count] = await Promise.all([
            prisma.equipmentAssignment.findMany({
              where: await scopedServiceWhere(req, "equipment.read"),
              include: { catalog: true },
              orderBy: { createdAt: "desc" },
              skip: (q.page - 1) * q.pageSize,
              take: q.pageSize,
            }),
            prisma.equipmentAssignment.count({
              where: await scopedServiceWhere(req, "equipment.read"),
            }),
          ]);
          items = dbItems;
          totalItems = count;
        } catch {
          setDatabaseOnline(false);
          items = [];
          totalItems = 0;
        }
      }

      res.json({
        items: items.map((a) => ({
          id: a.id,
          taskId: a.taskId,
          catalog: a.catalog,
          status: a.status,
          serialNumber: a.serialNumber,
          orderedAt: a.orderedAt?.toISOString() ?? null,
          expectedDelivery:
            a.expectedDelivery?.toISOString().slice(0, 10) ?? null,
          deliveredAt: a.deliveredAt?.toISOString() ?? null,
          receivedAt: a.receivedAt?.toISOString() ?? null,
          notes: a.notes,
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

// POST /api/v1/tasks/:taskId/equipment
workflowRouter.post(
  "/tasks/:taskId/equipment",
  requirePermission("equipment.assign"),
  validate({ body: CreateEquipmentAssignmentRequestSchema }),
  async (req, res, next) => {
    try {
      const b = req.body as z.infer<
        typeof CreateEquipmentAssignmentRequestSchema
      >;
      const task = await prisma.planTask.findUnique({
        where: { id: req.params.taskId },
      });
      if (!task) throw notFound("Task");

      const assignment = await prisma.equipmentAssignment.create({
        data: {
          taskId: req.params.taskId!,
          catalogId: b.catalogId,
          status: "REQUESTED",
          notes: b.notes ?? null,
        },
        include: { catalog: true },
      });

      res.status(201).json(assignment);
    } catch (e) {
      next(e);
    }
  },
);

// PATCH /api/v1/equipment/assignments/:id
workflowRouter.patch(
  "/equipment/assignments/:id",
  requirePermission("equipment.assign"),
  validate({ body: UpdateEquipmentAssignmentRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const b = req.body as z.infer<
        typeof UpdateEquipmentAssignmentRequestSchema
      >;
      if (b.status === "RECEIVED")
        throw conflict(
          "Employee receipt must be acknowledged through the receipt endpoint.",
        );

      const existing = await prisma.equipmentAssignment.findUnique({
        where: { id: req.params.id },
        include: { task: true },
      });
      if (!existing) throw notFound("Equipment assignment");

      const isDelivered = b.status === "DELIVERED";
      const deliveredAt = isDelivered ? new Date() : existing.deliveredAt;

      const updated = await prisma.equipmentAssignment.update({
        where: { id: req.params.id },
        data: {
          ...(b.status ? { status: b.status } : {}),
          ...(b.serialNumber !== undefined
            ? { serialNumber: b.serialNumber }
            : {}),
          ...(b.expectedDelivery
            ? { expectedDelivery: new Date(b.expectedDelivery) }
            : {}),
          ...(b.notes !== undefined ? { notes: b.notes } : {}),
          ...(isDelivered ? { deliveredAt } : {}),
        },
        include: { catalog: true },
      });

      // Delivery starts the employee receipt step; receipt completes onboarding.
      if (isDelivered) {
        await orchestrator.updateTask(
          existing.task.planId,
          existing.taskId,
          { status: "IN_PROGRESS" },
          { userId: actor.userId, role: actor.roles.join(",") },
        );
        const plan = await prisma.onboardingPlan.findUnique({
          where: { id: existing.task.planId },
          select: { employeeId: true },
        });
        const employee = plan
          ? await prisma.employee.findUnique({
              where: { id: plan.employeeId },
              select: { userId: true },
            })
          : null;
        await notifyUsers([employee?.userId, actor.userId], {
          type: "EQUIPMENT_DELIVERED",
          title: "Equipment delivered",
          body: `${updated.catalog.name} is ready for your receipt acknowledgment.`,
          link: `/employee/tasks`,
        });
      } else if (b.status === "SHIPPED" || b.status === "ORDERED") {
        await orchestrator.updateTask(
          existing.task.planId,
          existing.taskId,
          { status: "IN_PROGRESS" },
          { userId: actor.userId, role: actor.roles.join(",") },
        );
      }

      await writeAudit(req, {
        action: "equipment.updated",
        resourceType: "EquipmentAssignment",
        resourceId: updated.id,
        after: b,
      });

      res.json({
        id: updated.id,
        taskId: updated.taskId,
        catalog: updated.catalog,
        status: updated.status,
        serialNumber: updated.serialNumber,
        orderedAt: updated.orderedAt?.toISOString() ?? null,
        expectedDelivery:
          updated.expectedDelivery?.toISOString().slice(0, 10) ?? null,
        deliveredAt: updated.deliveredAt?.toISOString() ?? null,
        receivedAt: updated.receivedAt?.toISOString() ?? null,
        notes: updated.notes,
      });
    } catch (e) {
      next(e);
    }
  },
);

workflowRouter.post(
  "/equipment/assignments/:id/receipt",
  requirePermission("equipment.receipt"),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const existing = await prisma.equipmentAssignment.findUnique({
        where: { id: req.params.id },
        include: { task: { include: { plan: true } }, catalog: true },
      });
      if (!existing) throw notFound("Equipment assignment");
      if (existing.status !== "DELIVERED")
        throw conflict("Equipment must be delivered before it can be acknowledged.");
      if (existing.task.plan.employeeId !== actor.employeeId)
        throw notFound("Equipment assignment");

      const receivedAt = new Date();
      const updated = await prisma.equipmentAssignment.update({
        where: { id: existing.id },
        data: { status: "RECEIVED", receivedAt },
        include: { catalog: true },
      });
      await orchestrator.updateTask(
        existing.task.planId,
        existing.taskId,
        { status: "COMPLETED" },
        { userId: actor.userId, role: actor.roles.join(",") },
      );
      await writeAudit(req, {
        action: "equipment.received",
        resourceType: "EquipmentAssignment",
        resourceId: updated.id,
        after: { receivedAt: receivedAt.toISOString() },
      });
      res.json({
        id: updated.id,
        taskId: updated.taskId,
        catalog: updated.catalog,
        status: updated.status,
        serialNumber: updated.serialNumber,
        orderedAt: updated.orderedAt?.toISOString() ?? null,
        expectedDelivery: updated.expectedDelivery?.toISOString().slice(0, 10) ?? null,
        deliveredAt: updated.deliveredAt?.toISOString() ?? null,
        receivedAt: updated.receivedAt?.toISOString() ?? null,
        notes: updated.notes,
      });
    } catch (e) {
      next(e);
    }
  },
);
// 3. PAYROLL

// GET /api/v1/tasks/:taskId/payroll
workflowRouter.get(
  "/tasks/:taskId/payroll",
  requirePermission("payroll.read"),
  async (req, res, next) => {
    try {
      const payroll = await prisma.payrollSetup.findUnique({
        where: { taskId: req.params.taskId },
      });
      if (!payroll) throw notFound("Payroll setup");

      res.json({
        id: payroll.id,
        taskId: payroll.taskId,
        employeeId: payroll.employeeId,
        status: payroll.status,
        payFrequency: payroll.payFrequency,
        salaryCurrency: payroll.salaryCurrency,
        taxFormType: payroll.taxFormType,
        taxFormReceivedAt: payroll.taxFormReceivedAt?.toISOString() ?? null,
        bankAccountLast4: payroll.bankAccountLast4,
        nationalIdLast4: payroll.nationalIdLast4,
        verifiedByName: null,
        verifiedAt: payroll.verifiedAt?.toISOString() ?? null,
      });
    } catch (e) {
      next(e);
    }
  },
);

// PUT /api/v1/tasks/:taskId/payroll
workflowRouter.put(
  "/tasks/:taskId/payroll",
  requirePermission("payroll.write"),
  validate({ body: UpsertPayrollSetupRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const b = req.body as z.infer<typeof UpsertPayrollSetupRequestSchema>;

      const task = await prisma.planTask.findUnique({
        where: { id: req.params.taskId },
        include: { plan: true },
      });
      if (!task) throw notFound("Task");

      // Security decision: never persist raw bank numbers or national IDs. Extract last 4 only!
      const bankLast4 = b.bankAccountNumber
        ? b.bankAccountNumber.slice(-4)
        : undefined;
      const nationalIdLast4 = b.nationalId ? b.nationalId.slice(-4) : undefined;

      const payroll = await prisma.payrollSetup.upsert({
        where: { taskId: req.params.taskId! },
        create: {
          taskId: req.params.taskId!,
          employeeId: task.plan.employeeId,
          status: "READY",
          payFrequency: b.payFrequency ?? "SEMIMONTHLY",
          salaryCurrency: b.salaryCurrency ?? "CAD",
          taxFormType: b.taxFormType ?? "TD1",
          taxFormReceivedAt: b.taxFormReceived ? new Date() : null,
          bankAccountLast4: bankLast4 ?? null,
          nationalIdLast4: nationalIdLast4 ?? null,
        },
        update: {
          status: "READY",
          ...(b.payFrequency ? { payFrequency: b.payFrequency } : {}),
          ...(b.salaryCurrency ? { salaryCurrency: b.salaryCurrency } : {}),
          ...(b.taxFormType ? { taxFormType: b.taxFormType } : {}),
          ...(b.taxFormReceived !== undefined
            ? { taxFormReceivedAt: b.taxFormReceived ? new Date() : null }
            : {}),
          ...(bankLast4 ? { bankAccountLast4: bankLast4 } : {}),
          ...(nationalIdLast4 ? { nationalIdLast4 } : {}),
        },
      });

      await writeAudit(req, {
        action: "payroll.configured",
        resourceType: "PayrollSetup",
        resourceId: payroll.id,
        after: {
          payFrequency: payroll.payFrequency,
          currency: payroll.salaryCurrency,
        },
      });

      res.json({
        id: payroll.id,
        taskId: payroll.taskId,
        employeeId: payroll.employeeId,
        status: payroll.status,
        payFrequency: payroll.payFrequency,
        salaryCurrency: payroll.salaryCurrency,
        taxFormType: payroll.taxFormType,
        taxFormReceivedAt: payroll.taxFormReceivedAt?.toISOString() ?? null,
        bankAccountLast4: payroll.bankAccountLast4,
        nationalIdLast4: payroll.nationalIdLast4,
        verifiedByName: null,
        verifiedAt: null,
      });
    } catch (e) {
      next(e);
    }
  },
);

// POST /api/v1/tasks/:taskId/payroll/verify
workflowRouter.post(
  "/tasks/:taskId/payroll/verify",
  requirePermission("payroll.verify"),
  validate({ body: VerifyPayrollRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const b = req.body as z.infer<typeof VerifyPayrollRequestSchema>;

      const payroll = await prisma.payrollSetup.findUnique({
        where: { taskId: req.params.taskId },
        include: { task: true },
      });
      if (!payroll) throw notFound("Payroll setup");

      if (!payroll.taxFormReceivedAt || !payroll.bankAccountLast4)
        throw conflict(
          "Tax form and bank details are required before payroll verification.",
        );
      const verified = await prisma.payrollSetup.update({
        where: { taskId: req.params.taskId },
        data: {
          status: "VERIFIED",
          verifiedById: actor.userId,
          verifiedAt: new Date(),
        },
      });

      // Mark corresponding task COMPLETED
      await orchestrator.updateTask(
        payroll.task.planId,
        payroll.taskId,
        { status: "COMPLETED" },
        { userId: actor.userId, role: actor.roles.join(",") },
      );

      await writeAudit(req, {
        action: "payroll.verified",
        resourceType: "PayrollSetup",
        resourceId: payroll.id,
        reason: b.notes ?? "Verified by finance",
      });

      res.json({
        id: verified.id,
        taskId: verified.taskId,
        employeeId: verified.employeeId,
        status: verified.status,
        payFrequency: verified.payFrequency,
        salaryCurrency: verified.salaryCurrency,
        taxFormType: verified.taxFormType,
        taxFormReceivedAt: verified.taxFormReceivedAt?.toISOString() ?? null,
        bankAccountLast4: verified.bankAccountLast4,
        nationalIdLast4: verified.nationalIdLast4,
        verifiedByName: actor.email,
        verifiedAt: verified.verifiedAt?.toISOString() ?? null,
      });
    } catch (e) {
      next(e);
    }
  },
);
// 4. BENEFITS

// GET /api/v1/benefits/plans
workflowRouter.get(
  "/benefits/plans",
  requirePermission("benefit.read"),
  async (_req, res, next) => {
    try {
      const plans = await prisma.benefitPlan.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
      res.json(plans);
    } catch (e) {
      next(e);
    }
  },
);

// GET /api/v1/benefits/enrollments
workflowRouter.get(
  "/benefits/enrollments",
  requirePermission("benefit.read"),
  validate({ query: PaginationQuery }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof PaginationQuery>;

      let items: any[] = [];
      let totalItems = 0;
      if (isDatabaseOnline()) {
        try {
          const [dbItems, count] = await Promise.all([
            prisma.benefitEnrollment.findMany({
              where: await scopedServiceWhere(req, "benefit.read"),
              include: { benefitPlan: true },
              orderBy: { createdAt: "desc" },
              skip: (q.page - 1) * q.pageSize,
              take: q.pageSize,
            }),
            prisma.benefitEnrollment.count({
              where: await scopedServiceWhere(req, "benefit.read"),
            }),
          ]);
          items = dbItems;
          totalItems = count;
        } catch {
          setDatabaseOnline(false);
          items = [];
          totalItems = 0;
        }
      }

      const now = Date.now();

      res.json({
        items: items.map((e) => {
          const closes = e.windowClosesOn.getTime();
          const daysRemaining = Math.max(
            0,
            Math.ceil((closes - now) / (1000 * 60 * 60 * 24)),
          );

          return {
            id: e.id,
            taskId: e.taskId,
            benefitPlan: e.benefitPlan,
            status: e.status,
            windowOpensOn: e.windowOpensOn.toISOString().slice(0, 10),
            windowClosesOn: e.windowClosesOn.toISOString().slice(0, 10),
            daysRemaining,
            electedAt: e.electedAt?.toISOString() ?? null,
            waived: e.waived,
            dependentsCount: e.dependentsCount,
            notes: e.notes,
          };
        }),
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

// POST /api/v1/benefits/enrollments/:id/elect
workflowRouter.post(
  "/benefits/enrollments/:id/elect",
  requirePermission("benefit.enrol"),
  validate({ body: ElectBenefitRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const b = req.body as z.infer<typeof ElectBenefitRequestSchema>;

      const enrollment = await prisma.benefitEnrollment.findUnique({
        where: { id: req.params.id },
        include: { task: true, benefitPlan: true },
      });
      if (!enrollment) throw notFound("Benefit enrollment");

      if (
        enrollment.windowOpensOn > new Date() ||
        enrollment.windowClosesOn < new Date()
      )
        throw conflict("The benefit election window is not open.");
      const isElect = b.decision === "ELECT";

      const updated = await prisma.benefitEnrollment.update({
        where: { id: req.params.id },
        data: {
          status: isElect ? "ELECTED" : "WAIVED",
          electedAt: new Date(),
          waived: !isElect,
          dependentsCount: b.dependentsCount,
          notes: b.notes ?? null,
        },
        include: { benefitPlan: true },
      });

      // Mark corresponding task COMPLETED
      await orchestrator.updateTask(
        enrollment.task.planId,
        enrollment.taskId,
        { status: "COMPLETED" },
        { userId: actor.userId, role: actor.roles.join(",") },
      );

      await writeAudit(req, {
        action: isElect ? "benefit.elected" : "benefit.waived",
        resourceType: "BenefitEnrollment",
        resourceId: updated.id,
        after: { decision: b.decision, dependents: b.dependentsCount },
      });

      res.json({
        id: updated.id,
        taskId: updated.taskId,
        benefitPlan: updated.benefitPlan,
        status: updated.status,
        windowOpensOn: updated.windowOpensOn.toISOString().slice(0, 10),
        windowClosesOn: updated.windowClosesOn.toISOString().slice(0, 10),
        daysRemaining: 0,
        electedAt: updated.electedAt?.toISOString() ?? null,
        waived: updated.waived,
        dependentsCount: updated.dependentsCount,
        notes: updated.notes,
      });
    } catch (e) {
      next(e);
    }
  },
);
// 5. TRAINING

// GET /api/v1/training/courses
workflowRouter.get(
  "/training/courses",
  requirePermission("training.read"),
  async (_req, res, next) => {
    try {
      const courses = await prisma.trainingCourse.findMany({
        where: { isActive: true },
        orderBy: { title: "asc" },
      });
      res.json(courses);
    } catch (e) {
      next(e);
    }
  },
);

// GET /api/v1/training/assignments
workflowRouter.get(
  "/training/assignments",
  requirePermission("training.read"),
  validate({ query: PaginationQuery }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof PaginationQuery>;

      let items: any[] = [];
      let totalItems = 0;
      if (isDatabaseOnline()) {
        try {
          const [dbItems, count] = await Promise.all([
            prisma.trainingAssignment.findMany({
              where: await scopedServiceWhere(req, "training.read"),
              include: { course: true },
              orderBy: { dueDate: "asc" },
              skip: (q.page - 1) * q.pageSize,
              take: q.pageSize,
            }),
            prisma.trainingAssignment.count({
              where: await scopedServiceWhere(req, "training.read"),
            }),
          ]);
          items = dbItems;
          totalItems = count;
        } catch {
          setDatabaseOnline(false);
          items = [];
          totalItems = 0;
        }
      }

      res.json({
        items: items.map((a) => ({
          id: a.id,
          taskId: a.taskId,
          course: a.course,
          status: a.status,
          assignedAt: a.assignedAt.toISOString(),
          dueDate: a.dueDate.toISOString().slice(0, 10),
          startedAt: a.startedAt?.toISOString() ?? null,
          completedAt: a.completedAt?.toISOString() ?? null,
          scorePercent: a.scorePercent,
          isStatutory: (a.course.statutoryDeadlineDays ?? 0) > 0,
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

// POST /api/v1/training/assignments/:id/complete
workflowRouter.post(
  "/training/assignments/:id/complete",
  requirePermission("training.complete"),
  validate({ body: CompleteTrainingRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const b = req.body as z.infer<typeof CompleteTrainingRequestSchema>;

      const assignment = await prisma.trainingAssignment.findUnique({
        where: { id: req.params.id },
        include: { task: true, course: true },
      });
      if (!assignment) throw notFound("Training assignment");

      const completedAt = b.completedAt ? new Date(b.completedAt) : new Date();

      const updated = await prisma.trainingAssignment.update({
        where: { id: req.params.id },
        data: {
          status: "COMPLETED",
          scorePercent: b.scorePercent ?? null,
          completedAt,
        },
        include: { course: true },
      });

      // Mark corresponding task COMPLETED
      await orchestrator.updateTask(
        assignment.task.planId,
        assignment.taskId,
        { status: "COMPLETED" },
        { userId: actor.userId, role: actor.roles.join(",") },
      );

      await writeAudit(req, {
        action: "training.completed",
        resourceType: "TrainingAssignment",
        resourceId: updated.id,
        after: { score: updated.scorePercent, completedAt },
      });

      res.json({
        id: updated.id,
        taskId: updated.taskId,
        course: updated.course,
        status: updated.status,
        assignedAt: updated.assignedAt.toISOString(),
        dueDate: updated.dueDate.toISOString().slice(0, 10),
        startedAt: updated.startedAt?.toISOString() ?? null,
        completedAt: updated.completedAt?.toISOString() ?? null,
        scorePercent: updated.scorePercent,
        isStatutory: (updated.course.statutoryDeadlineDays ?? 0) > 0,
      });
    } catch (e) {
      next(e);
    }
  },
);
// 6. MANAGER TASKS

// GET /api/v1/manager-tasks
workflowRouter.get(
  "/manager-tasks",
  requirePermission("managertask.read"),
  validate({ query: PaginationQuery }),
  async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof PaginationQuery>;

      let items: any[] = [];
      let totalItems = 0;
      if (isDatabaseOnline()) {
        try {
          const planScope = await scopedServiceWhere(req, "managertask.read");
          const taskWhere = {
            service: "MANAGER" as const,
            plan: { ...((planScope as any).task?.plan ?? {}), status: { in: ["APPROVED", "IN_PROGRESS"] } },
          };
          const [dbItems, count] = await Promise.all([
            prisma.planTask.findMany({
              where: taskWhere,
              include: {
                managerTask: { include: { buddyEmployee: { select: { firstName: true, lastName: true } } } },
                plan: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } },
                dependencies: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
              },
              orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
              skip: (q.page - 1) * q.pageSize,
              take: q.pageSize,
            }),
            prisma.planTask.count({ where: taskWhere }),
          ]);
        items = dbItems;
          totalItems = count;
        } catch {
          setDatabaseOnline(false);
          items = [];
          totalItems = 0;
        }
      }

      res.json({
        items: items.map((m) => ({
          id: m.managerTask?.id ?? m.id,
          taskId: m.id,
          kind: managerKindByTaskType[m.taskType] ?? m.managerTask?.kind ?? "DAY_ONE_AGENDA",
          buddyEmployeeId: m.managerTask?.buddyEmployeeId ?? null,
          buddyName: m.managerTask?.buddyEmployee
            ? `${m.managerTask.buddyEmployee.firstName} ${m.managerTask.buddyEmployee.lastName}`
            : null,
          agenda: (m.managerTask?.agenda as any) ?? null,
          notes: m.managerTask?.notes ?? null,
          completedAt: m.managerTask?.completedAt?.toISOString() ?? null,
          employeeId: m.plan.employeeId,
          employeeName: `${m.plan.employee.firstName} ${m.plan.employee.lastName}`,
          planId: m.planId,
          planStatus: m.plan.status,
          taskTitle: m.title,
          taskDescription: m.description,
          taskStatus: m.status,
          dueDate: m.dueDate.toISOString().slice(0, 10),
          blockedBy: m.dependencies
            .filter((d: any) => !["COMPLETED", "SKIPPED"].includes(d.dependsOn.status))
            .map((d: any) => d.dependsOn.title),
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

// GET /api/v1/tasks/:taskId/manager
workflowRouter.get(
  "/tasks/:taskId/manager",
  requirePermission("managertask.read"),
  async (req, res, next) => {
    try {
      const m = await prisma.managerTask.findUnique({
        where: { taskId: req.params.taskId },
        include: {
          buddyEmployee: { select: { firstName: true, lastName: true } },
        },
      });
      if (!m) throw notFound("Manager task");

      res.json({
        id: m.id,
        taskId: m.taskId,
        kind: m.kind,
        buddyEmployeeId: m.buddyEmployeeId,
        buddyName: m.buddyEmployee
          ? `${m.buddyEmployee.firstName} ${m.buddyEmployee.lastName}`
          : null,
        agenda: m.agenda as any,
        notes: m.notes,
        completedAt: m.completedAt?.toISOString() ?? null,
      });
    } catch (e) {
      next(e);
    }
  },
);

// PUT /api/v1/tasks/:taskId/manager
workflowRouter.put(
  "/tasks/:taskId/manager",
  requirePermission("managertask.write"),
  validate({ body: UpsertManagerTaskRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const b = req.body as z.infer<typeof UpsertManagerTaskRequestSchema>;

      const task = await prisma.planTask.findUnique({
        where: { id: req.params.taskId },
        include: { plan: true },
      });
      if (!task || task.service !== "MANAGER") throw notFound("Manager task");

      const isComplete = b.markComplete ?? false;
      const existing = await prisma.managerTask.findUnique({ where: { taskId: task.id } });
      const effectiveBuddy = b.buddyEmployeeId ?? existing?.buddyEmployeeId;
      if (effectiveBuddy) {
        const [newHire, buddy] = await Promise.all([
          prisma.employee.findUnique({ where: { id: task.plan.employeeId }, select: { id: true, departmentId: true } }),
          prisma.employee.findUnique({ where: { id: effectiveBuddy }, select: { id: true, managerId: true, departmentId: true, status: true } }),
        ]);
        if (!newHire || !buddy || buddy.id === newHire.id || buddy.status !== "ACTIVE" || buddy.departmentId !== newHire.departmentId)
          throw badRequest("Choose an active team member from the new hire’s department.");
        if (actor.roles.includes("manager") && !actor.roles.includes("hr_admin") && buddy.managerId !== actor.employeeId)
          throw badRequest("Choose a peer from your own team as the onboarding buddy.");
      }
      const effectiveAgenda = b.agenda ?? (existing?.agenda as any[] | null) ?? [];
      const effectiveNotes = b.notes ?? existing?.notes ?? "";
      if (isComplete) {
        if (task.taskType === "ASSIGN_BUDDY" && !effectiveBuddy)
          throw badRequest("Choose an onboarding buddy before completing this task.");
        if (["PREPARE_DAY_ONE_AGENDA", "SCHEDULE_INTRO_MEETINGS"].includes(task.taskType) && !effectiveAgenda.length)
          throw badRequest("Add at least one agenda item before completing this task.");
        if (["APPROVE_SYSTEM_ACCESS", "SET_PROBATION_GOALS"].includes(task.taskType) && !effectiveNotes.trim())
          throw badRequest("Add completion notes before completing this task.");
      }

      if (isComplete) {
        await orchestrator.updateTask(
          task.planId,
          task.id,
          { status: "COMPLETED" },
          { userId: actor.userId, role: actor.roles.join(",") },
        );
      }

      const updated = await prisma.managerTask.upsert({
        where: { taskId: req.params.taskId! },
        create: {
          taskId: req.params.taskId!,
          kind: (managerKindByTaskType[task.taskType] ?? "DAY_ONE_AGENDA") as any,
          buddyEmployeeId: b.buddyEmployeeId ?? null,
          agenda: b.agenda as any,
          notes: b.notes ?? null,
          completedAt: isComplete ? new Date() : null,
        },
        update: {
          ...(b.buddyEmployeeId !== undefined
            ? { buddyEmployeeId: b.buddyEmployeeId }
            : {}),
          ...(b.agenda !== undefined ? { agenda: b.agenda as any } : {}),
          ...(b.notes !== undefined ? { notes: b.notes } : {}),
          ...(isComplete ? { completedAt: new Date() } : {}),
        },
        include: {
          buddyEmployee: { select: { firstName: true, lastName: true } },
        },
      });

      await writeAudit(req, {
        action: "managertask.updated",
        resourceType: "ManagerTask",
        resourceId: updated.id,
        after: { completed: isComplete },
      });

      const buddy = (updated as any).buddyEmployee;
      const buddyName = buddy ? `${buddy.firstName} ${buddy.lastName}` : null;

      res.json({
        id: updated.id,
        taskId: updated.taskId,
        kind: updated.kind,
        buddyEmployeeId: updated.buddyEmployeeId,
        buddyName,
        agenda: updated.agenda as any,
        notes: updated.notes,
        completedAt: updated.completedAt?.toISOString() ?? null,
      });
    } catch (e) {
      next(e);
    }
  },
);
