import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export { z };
// Primitives

export const Uuid = z.string().uuid().openapi({
  example: "3f1a7c2e-9b4d-4f08-8d21-6b5e2a1c9d44",
});

/** ISO calendar date, no time component. */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
  .openapi({ format: "date", example: "2026-12-01" });

export const IsoDateTime = z.string().datetime({ offset: true }).openapi({
  format: "date-time",
  example: "2026-11-06T09:30:00.000Z",
});

export const Email = z.string().email().toLowerCase().trim().openapi({
  format: "email",
  example: "hr.admin@demo.io",
});

/** App login identities may use the organization's internal CLYORA domain. */
export const IdentityEmail = z.union([
  Email,
  z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._-]*@clyora$/, "must be a valid CLYORA work email"),
]);

/**
 * Password policy. Deliberately explicit so the frontend can mirror the rule
 * without guessing, and so the error message is actionable.
 */
export const Password = z
  .string()
  .min(12, "must be at least 12 characters")
  .max(128)
  .regex(/[a-z]/, "must contain a lowercase letter")
  .regex(/[A-Z]/, "must contain an uppercase letter")
  .regex(/[0-9]/, "must contain a digit")
  .openapi({ example: "Onboard!ng2026" });

/** Stable, human-meaningful policy clause id, e.g. "CA-ON-BEN-004". */
export const ClauseId = z
  .string()
  .regex(/^[A-Z]{2}(-[A-Z0-9]{1,3})?-[A-Z]{2,4}-\d{3}$/, "invalid clause id")
  .openapi({ example: "CA-ON-BEN-004" });

export const JurisdictionCode = z
  .string()
  .regex(/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/)
  .openapi({ example: "CA-ON" });
// Enums — these MUST stay in step with prisma/schema.prisma.
// A unit test asserts that every Prisma enum member appears here.

export const UserStatusEnum = z.enum([
  "INVITED",
  "ACTIVE",
  "SUSPENDED",
  "LOCKED",
]);
export const PermissionScopeEnum = z.enum([
  "SELF",
  "REPORTS",
  "DEPARTMENT",
  "ORG",
]);
export const EmploymentTypeEnum = z.enum([
  "FULL_TIME",
  "PART_TIME",
  "CONTRACTOR",
  "INTERN",
]);
export const WorkModeEnum = z.enum(["REMOTE", "ONSITE", "HYBRID"]);
export const EmployeeStatusEnum = z.enum([
  "PRE_HIRE",
  "ONBOARDING",
  "ACTIVE",
  "WITHDRAWN",
]);
export const ServiceAreaEnum = z.enum([
  "DOCUMENTS",
  "EQUIPMENT",
  "PAYROLL",
  "BENEFITS",
  "TRAINING",
  "MANAGER",
]);
export const OwnerRoleEnum = z.enum([
  "HR",
  "IT",
  "FINANCE",
  "MANAGER",
  "EMPLOYEE",
  "LND",
  "COMPLIANCE",
]);

/**
 * CLOSED VOCABULARY — guardrail V8.
 * The LLM's output schema reuses this exact enum, so a prompt-injected
 * instruction cannot invent a task type: anything outside this list fails
 * schema validation before it is ever persisted.
 */
export const TaskTypeEnum = z.enum([
  // DOCUMENTS
  "COLLECT_ID_PROOF",
  "COLLECT_ADDRESS_PROOF",
  "COLLECT_EDUCATION_CERTIFICATE",
  "COLLECT_PREVIOUS_EMPLOYMENT_PROOF",
  "RIGHT_TO_WORK_CHECK",
  "SIGN_EMPLOYMENT_CONTRACT",
  "SIGN_NDA",
  "BACKGROUND_VERIFICATION",
  // EQUIPMENT
  "PROVISION_LAPTOP",
  "PROVISION_PERIPHERALS",
  "PROVISION_MOBILE_DEVICE",
  "ISSUE_ACCESS_BADGE",
  "CREATE_SYSTEM_ACCOUNTS",
  "GRANT_APPLICATION_ACCESS",
  // PAYROLL
  "COLLECT_TAX_DECLARATION",
  "COLLECT_BANK_DETAILS",
  "COLLECT_NATIONAL_ID",
  "PAYROLL_PROFILE_SETUP",
  "PAYROLL_FIRST_RUN_VERIFICATION",
  // BENEFITS
  "BENEFITS_ELECTION",
  "PENSION_AUTO_ENROLMENT",
  "MEDICAL_INSURANCE_ENROLMENT",
  "DEPENDENT_DECLARATION",
  // TRAINING
  "MANDATORY_COMPLIANCE_TRAINING",
  "HEALTH_AND_SAFETY_TRAINING",
  "DATA_PROTECTION_TRAINING",
  "ROLE_SPECIFIC_TRAINING",
  // MANAGER
  "ASSIGN_BUDDY",
  "PREPARE_DAY_ONE_AGENDA",
  "SCHEDULE_INTRO_MEETINGS",
  "APPROVE_SYSTEM_ACCESS",
  "SET_PROBATION_GOALS",
]);

export const AuthorityClassEnum = z.enum(["ROUTINE", "PAY_AFFECTING", "LEGAL"]);

export const DeadlineAnchorEnumValues = [
  "OFFER_DATE",
  "PLAN_CREATED",
  "START_DATE",
] as const;
export const DeadlineAnchorEnum = z.enum(DeadlineAnchorEnumValues);
export const DeadlineBasisEnumValues = [
  "CALENDAR_DAYS",
  "BUSINESS_DAYS",
] as const;
export const DeadlineBasisEnum = z.enum(DeadlineBasisEnumValues);
export const PlanStatusEnum = z.enum([
  "DRAFT",
  "AWAITING_APPROVAL",
  "APPROVED",
  "IN_PROGRESS",
  "AWAITING_COMPLETION_APPROVAL",
  "COMPLETED",
  "REFUSED",
]);
export const GenerationModeEnum = z.enum(["LLM_GROUNDED", "BASELINE_FALLBACK"]);
export const TaskOriginEnum = z.enum([
  "TEMPLATE",
  "LLM_ACCEPTED",
  "LLM_REPAIRED",
  "VALIDATOR_INSERTED",
  "HUMAN_ADDED",
]);
export const ReviewStateEnum = z.enum([
  "OK",
  "NEEDS_REVIEW",
  "ESCALATED",
  "REJECTED",
]);
export const TaskStatusEnum = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "SKIPPED",
]);
export const DocumentStatusEnum = z.enum([
  "REQUESTED",
  "UPLOADED",
  "VERIFIED",
  "REJECTED",
]);
export const EquipmentStatusEnum = z.enum([
  "REQUESTED",
  "ORDERED",
  "SHIPPED",
  "DELIVERED",
  "RECEIVED",
  "RETURNED",
]);
export const PayrollSetupStatusEnum = z.enum([
  "PENDING",
  "AWAITING_TAX_FORM",
  "AWAITING_BANK_DETAILS",
  "READY",
  "VERIFIED",
]);
export const BenefitEnrollmentStatusEnum = z.enum([
  "WINDOW_OPEN",
  "ELECTED",
  "WAIVED",
  "WINDOW_CLOSED",
  "AUTO_ENROLLED",
]);
export const TrainingStatusEnum = z.enum([
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "OVERDUE",
]);
export const BenefitTypeEnum = z.enum([
  "MEDICAL",
  "DENTAL",
  "VISION",
  "PENSION",
  "LIFE_INSURANCE",
  "WELLNESS",
]);
export const ManagerTaskKindEnum = z.enum([
  "BUDDY_ASSIGNMENT",
  "DAY_ONE_AGENDA",
  "INTRO_MEETINGS",
  "ACCESS_APPROVAL",
  "PROBATION_GOALS",
]);
export const ValidatorIdEnum = z.enum([
  "V1_SCHEMA",
  "V2_CITATION_INTEGRITY",
  "V3_JURISDICTION_SCOPE",
  "V4_MANDATORY_COVERAGE",
  "V5_GRAPH_INTEGRITY",
  "V6_DEADLINE_RECOMPUTE",
  "V7_AUTHORITY_GUARD",
  "V8_CLOSED_VOCABULARY",
]);
export const FindingSeverityEnum = z.enum(["INFO", "WARN", "REJECT"]);
export const FindingActionEnum = z.enum([
  "ACCEPTED",
  "REPAIRED",
  "REJECTED",
  "FLAGGED",
  "INSERTED",
]);
export const EscalationStatusEnum = z.enum([
  "OPEN",
  "IN_REVIEW",
  "RESOLVED",
  "DISMISSED",
]);

/**
 * Role keys. Exactly the three user types in the system architecture diagram:
 * HR Admin, Manager and New Employee. Seeded by packages/db/prisma/seed.ts.
 */
export const RoleKeyEnum = z.enum([
  "hr_admin",
  "it_admin",
  "manager",
  "employee",
]);
// Error envelope — EVERY non-2xx response in this API has this shape.

export const ErrorCodeEnum = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "TOKEN_EXPIRED",
  "TOKEN_INVALID",
  "FORBIDDEN",
  "OUT_OF_SCOPE",
  "NOT_FOUND",
  "CONFLICT",
  "ACCOUNT_LOCKED",
  "PASSWORD_CHANGE_REQUIRED",
  "APPROVAL_BLOCKED",
  "UNSUPPORTED_JURISDICTION",
  "RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export const FieldErrorSchema = z
  .object({
    path: z.string().openapi({ example: "startDate" }),
    message: z.string().openapi({ example: "must be YYYY-MM-DD" }),
    code: z.string().optional().openapi({ example: "invalid_string" }),
  })
  .openapi("FieldError");

export const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: ErrorCodeEnum.openapi({ example: "VALIDATION_FAILED" }),
      message: z
        .string()
        .openapi({ example: "Request body failed validation" }),
      /** Present only for VALIDATION_FAILED. */
      fields: z.array(FieldErrorSchema).optional(),
      /** Echo of x-request-id. Quote this when reporting a bug. */
      requestId: z
        .string()
        .openapi({ example: "b7c1e2f0-5a3d-4c11-9f2e-8d6a4b0c1e77" }),
      timestamp: IsoDateTime,
    }),
  })
  .openapi("ErrorResponse");

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
// Pagination

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .openapi({ example: 20 }),
});

export const PageMetaSchema = z
  .object({
    page: z.number().int(),
    pageSize: z.number().int(),
    totalItems: z.number().int(),
    totalPages: z.number().int(),
  })
  .openapi("PageMeta");
export type PageMeta = z.infer<typeof PageMetaSchema>;

/** Wraps any item schema in the standard list envelope. */
export function paginated<T extends z.ZodTypeAny>(item: T, name: string) {
  return z.object({ items: z.array(item), meta: PageMetaSchema }).openapi(name);
}
// Async job envelope — plan generation returns 202 with one of these.

export const JobStatusEnum = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
]);

/** Named pipeline stages, so the UI can show real progress not a spinner. */
export const JobStageEnum = z.enum([
  "PROFILE_INTAKE",
  "JURISDICTION_RESOLUTION",
  "CLAUSE_RETRIEVAL",
  "PLAN_PROPOSAL",
  "VALIDATION",
  "GRAPH_AND_RISK",
  "PERSISTED",
]);

export const JobAcceptedSchema = z
  .object({
    jobId: Uuid,
    status: JobStatusEnum,
    pollUrl: z
      .string()
      .openapi({
        example: "/api/v1/jobs/3f1a7c2e-9b4d-4f08-8d21-6b5e2a1c9d44",
      }),
  })
  .openapi("JobAccepted");

export const JobStateSchema = z
  .object({
    jobId: Uuid,
    status: JobStatusEnum,
    stage: JobStageEnum.nullable(),
    progressPercent: z.number().int().min(0).max(100),
    resultUrl: z
      .string()
      .nullable()
      .openapi({ example: "/api/v1/plans/9b4d..." }),
    error: z.string().nullable(),
    startedAt: IsoDateTime.nullable(),
    finishedAt: IsoDateTime.nullable(),
  })
  .openapi("JobState");
// Health

export const HealthSchema = z
  .object({ status: z.literal("ok"), uptimeSeconds: z.number() })
  .openapi("Health");

export const ReadinessSchema = z
  .object({
    status: z.enum(["ready", "degraded", "unavailable"]),
    checks: z.object({
      database: z.enum(["up", "down"]),
      /** "down" here is what triggers BASELINE_FALLBACK plan generation. */
      llm: z.enum(["up", "down"]),
    }),
  })
  .openapi("Readiness");
