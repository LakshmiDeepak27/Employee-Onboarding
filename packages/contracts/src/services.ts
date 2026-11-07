import {
  z,
  Uuid,
  IsoDate,
  IsoDateTime,
  JurisdictionCode,
  DocumentStatusEnum,
  EquipmentStatusEnum,
  PayrollSetupStatusEnum,
  BenefitEnrollmentStatusEnum,
  BenefitTypeEnum,
  TrainingStatusEnum,
  ManagerTaskKindEnum,
  paginated,
} from "./common.js";
// 1. DOCUMENTS

export const DocumentSchema = z
  .object({
    id: Uuid,
    employeeId: Uuid,
    fileName: z.string(),
    mimeType: z.string().openapi({ example: "application/pdf" }),
    sizeBytes: z.number().int(),
    checksum: z.string().openapi({ description: "SHA-256 of the file bytes" }),
    uploadedByName: z.string().nullable(),
    uploadedAt: IsoDateTime,
    downloadUrl: z
      .string()
      .openapi({ example: "/api/v1/documents/{id}/content" }),
  })
  .openapi("Document");

export const DocumentRequestSchema = z
  .object({
    id: Uuid,
    taskId: Uuid,
    documentType: z.string().openapi({ example: "PASSPORT" }),
    isRequired: z.boolean(),
    status: DocumentStatusEnum,
    document: DocumentSchema.nullable(),
    verifiedByName: z.string().nullable(),
    verifiedAt: IsoDateTime.nullable(),
    rejectionReason: z.string().nullable(),
  })
  .openapi("DocumentRequest");

/** multipart/form-data: `file` plus these fields. */
export const UploadDocumentRequestSchema = z
  .object({
    fileName: z.string().min(1).max(180),
    mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
    contentBase64: z
      .string()
      .min(4)
      .max(7_000_000)
      .openapi({
        description: "Base64 file content; maximum decoded size 5 MB.",
      }),
  })
  .openapi("UploadDocumentRequest");

export const VerifyDocumentRequestSchema = z
  .object({
    decision: z.enum(["VERIFY", "REJECT"]),
    rejectionReason: z.string().max(500).optional(),
  })
  .refine((v) => v.decision !== "REJECT" || !!v.rejectionReason, {
    message: "rejectionReason is required when rejecting",
    path: ["rejectionReason"],
  })
  .openapi("VerifyDocumentRequest");

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MiB
// 2. EQUIPMENT (IT)

export const EquipmentCatalogItemSchema = z
  .object({
    id: Uuid,
    sku: z.string().openapi({ example: "LAPTOP-MBP14" }),
    name: z.string(),
    category: z.string().openapi({ example: "laptop" }),
    leadTimeDays: z.number().int().openapi({
      description:
        "Drives the at-risk calculation: order date = start date - leadTimeDays.",
    }),
    isActive: z.boolean(),
  })
  .openapi("EquipmentCatalogItem");

export const EquipmentAssignmentSchema = z
  .object({
    id: Uuid,
    taskId: Uuid,
    catalog: EquipmentCatalogItemSchema,
    status: EquipmentStatusEnum,
    serialNumber: z.string().nullable(),
    orderedAt: IsoDateTime.nullable(),
    expectedDelivery: IsoDate.nullable(),
    deliveredAt: IsoDateTime.nullable(),
    notes: z.string().nullable(),
  })
  .openapi("EquipmentAssignment");

export const CreateEquipmentAssignmentRequestSchema = z
  .object({
    catalogId: Uuid,
    notes: z.string().max(500).optional(),
  })
  .openapi("CreateEquipmentAssignmentRequest");

export const UpdateEquipmentAssignmentRequestSchema = z
  .object({
    status: EquipmentStatusEnum.optional(),
    serialNumber: z.string().max(64).optional(),
    expectedDelivery: IsoDate.optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one field is required",
  })
  .openapi("UpdateEquipmentAssignmentRequest");
// 3. PAYROLL (Finance)
//
// SECURITY NOTE: this is a demonstration system. Full bank numbers and
// national ids are NEVER stored or returned. The API accepts them, derives
// the last four digits plus an opaque token, and discards the rest.

export const PayrollSetupSchema = z
  .object({
    id: Uuid,
    taskId: Uuid,
    employeeId: Uuid,
    status: PayrollSetupStatusEnum,
    payFrequency: z
      .enum(["WEEKLY", "BIWEEKLY", "SEMIMONTHLY", "MONTHLY"])
      .nullable(),
    salaryCurrency: z.string().length(3).nullable().openapi({ example: "CAD" }),
    taxFormType: z.string().nullable().openapi({
      example: "TD1",
      description:
        "Jurisdiction-specific: TD1 (CA), P45/Starter Checklist (GB), Form 12BB (IN).",
    }),
    taxFormReceivedAt: IsoDateTime.nullable(),
    bankAccountLast4: z.string().length(4).nullable(),
    nationalIdLast4: z.string().length(4).nullable(),
    verifiedByName: z.string().nullable(),
    verifiedAt: IsoDateTime.nullable(),
  })
  .openapi("PayrollSetup");

export const UpsertPayrollSetupRequestSchema = z
  .object({
    payFrequency: z
      .enum(["WEEKLY", "BIWEEKLY", "SEMIMONTHLY", "MONTHLY"])
      .optional(),
    salaryCurrency: z.string().length(3).toUpperCase().optional(),
    taxFormType: z.string().max(40).optional(),
    taxFormReceived: z.boolean().optional(),
    /** Write-only. Only the last four digits are persisted. */
    bankAccountNumber: z
      .string()
      .regex(/^\d{6,20}$/, "must be 6-20 digits")
      .optional()
      .openapi({
        description: "Write-only. Never returned. Only last4 is stored.",
      }),
    /** Write-only. Only the last four digits are persisted. */
    nationalId: z
      .string()
      .min(4)
      .max(32)
      .optional()
      .openapi({
        description: "Write-only. Never returned. Only last4 is stored.",
      }),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one field is required",
  })
  .openapi("UpsertPayrollSetupRequest");

export const VerifyPayrollRequestSchema = z
  .object({
    acknowledgement: z.literal(true).openapi({
      description:
        "Payroll verification is PAY_AFFECTING. The verifier is recorded in the audit trail.",
    }),
    notes: z.string().max(500).optional(),
  })
  .openapi("VerifyPayrollRequest");
// 4. BENEFITS (HR)

export const BenefitPlanSchema = z
  .object({
    id: Uuid,
    code: z.string().openapi({ example: "CA-MED-STD" }),
    name: z.string(),
    type: BenefitTypeEnum,
    jurisdictionCode: JurisdictionCode.nullable(),
    enrollmentWindowDays: z.number().int(),
    isAutoEnrol: z.boolean().openapi({
      description:
        "True for statutory auto-enrolment schemes such as UK pension.",
    }),
    description: z.string().nullable(),
  })
  .openapi("BenefitPlan");

export const BenefitEnrollmentSchema = z
  .object({
    id: Uuid,
    taskId: Uuid,
    benefitPlan: BenefitPlanSchema,
    status: BenefitEnrollmentStatusEnum,
    windowOpensOn: IsoDate,
    windowClosesOn: IsoDate.openapi({
      description:
        "Computed by the deadline engine. Missing this window has real consequences.",
    }),
    daysRemaining: z.number().int(),
    electedAt: IsoDateTime.nullable(),
    waived: z.boolean(),
    dependentsCount: z.number().int(),
    notes: z.string().nullable(),
  })
  .openapi("BenefitEnrollment");

export const ElectBenefitRequestSchema = z
  .object({
    decision: z.enum(["ELECT", "WAIVE"]),
    dependentsCount: z.number().int().min(0).max(20).default(0),
    notes: z.string().max(500).optional(),
  })
  .openapi("ElectBenefitRequest");
// 5. TRAINING (L&D)

export const TrainingCourseSchema = z
  .object({
    id: Uuid,
    code: z.string().openapi({ example: "OHS-ON-101" }),
    title: z.string(),
    provider: z.string().nullable(),
    durationMinutes: z.number().int(),
    mandatoryForJurisdictions: z.array(JurisdictionCode),
    mandatoryForRoles: z.array(z.string()),
    statutoryDeadlineDays: z.number().int().nullable(),
  })
  .openapi("TrainingCourse");

export const TrainingAssignmentSchema = z
  .object({
    id: Uuid,
    taskId: Uuid,
    course: TrainingCourseSchema,
    status: TrainingStatusEnum,
    assignedAt: IsoDateTime,
    dueDate: IsoDate,
    startedAt: IsoDateTime.nullable(),
    completedAt: IsoDateTime.nullable(),
    scorePercent: z.number().int().min(0).max(100).nullable(),
    isStatutory: z.boolean(),
  })
  .openapi("TrainingAssignment");

export const CreateTrainingAssignmentRequestSchema = z
  .object({ courseId: Uuid, dueDate: IsoDate.optional() })
  .openapi("CreateTrainingAssignmentRequest");

export const CompleteTrainingRequestSchema = z
  .object({
    scorePercent: z.number().int().min(0).max(100).optional(),
    completedAt: IsoDateTime.optional(),
  })
  .openapi("CompleteTrainingRequest");
// 6. MANAGER TASKS (team setup)

export const ManagerTaskSchema = z
  .object({
    id: Uuid,
    taskId: Uuid,
    kind: ManagerTaskKindEnum,
    buddyEmployeeId: Uuid.nullable(),
    buddyName: z.string().nullable(),
    agenda: z
      .array(
        z.object({
          time: z.string().openapi({ example: "09:30" }),
          title: z.string(),
          owner: z.string().optional(),
        }),
      )
      .nullable(),
    notes: z.string().nullable(),
    completedAt: IsoDateTime.nullable(),
  })
  .openapi("ManagerTask");

export const UpsertManagerTaskRequestSchema = z
  .object({
    buddyEmployeeId: Uuid.optional(),
    agenda: z
      .array(
        z.object({
          time: z.string().regex(/^\d{2}:\d{2}$/),
          title: z.string().min(1).max(200),
          owner: z.string().max(120).optional(),
        }),
      )
      .max(20)
      .optional(),
    notes: z.string().max(2000).optional(),
    markComplete: z.boolean().default(false),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one field is required",
  })
  .openapi("UpsertManagerTaskRequest");
// List envelopes

export const DocumentRequestListResponseSchema = paginated(
  DocumentRequestSchema,
  "DocumentRequestListResponse",
);
export const EquipmentAssignmentListResponseSchema = paginated(
  EquipmentAssignmentSchema,
  "EquipmentAssignmentListResponse",
);
export const BenefitEnrollmentListResponseSchema = paginated(
  BenefitEnrollmentSchema,
  "BenefitEnrollmentListResponse",
);
export const TrainingAssignmentListResponseSchema = paginated(
  TrainingAssignmentSchema,
  "TrainingAssignmentListResponse",
);
export const ManagerTaskListResponseSchema = paginated(
  ManagerTaskSchema,
  "ManagerTaskListResponse",
);
