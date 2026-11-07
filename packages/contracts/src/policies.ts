import {
  z,
  Uuid,
  ClauseId,
  IsoDate,
  IsoDateTime,
  JurisdictionCode,
  UserStatusEnum,
  RoleKeyEnum,
  PermissionScopeEnum,
  Email,
  IdentityEmail,
  PaginationQuery,
  paginated,
} from "./common.js";
// POLICY KNOWLEDGE BASE

export const PolicyDocumentSchema = z
  .object({
    id: Uuid,
    jurisdictionCode: JurisdictionCode.nullable().openapi({
      description: "Null means the document applies globally.",
    }),
    title: z.string(),
    category: z.string().openapi({ example: "payroll" }),
    sourceUri: z.string(),
    version: z.string().openapi({ example: "2026.1" }),
    effectiveFrom: IsoDate,
    isMock: z.boolean().openapi({
      description:
        "True only for demonstration content; production policy sources are explicitly entered and approved by the organization.",
    }),
    clauseCount: z.number().int(),
  })
  .openapi("PolicyDocument");

export const PolicyClauseSchema = z
  .object({
    id: ClauseId,
    documentId: Uuid,
    documentTitle: z.string(),
    jurisdictionCode: JurisdictionCode.nullable(),
    heading: z.string().nullable(),
    body: z.string(),
    topics: z.array(z.string()),
    isMock: z.boolean(),
  })
  .openapi("PolicyClause");

/**
 * GET /api/v1/clauses/{clauseId}
 * Clicking a citation in the UI calls this. A 404 here means validator V2
 * failed to do its job, so this endpoint is also a live integrity check.
 */
export const ResolveClauseResponseSchema = PolicyClauseSchema.extend({
  /** Character offsets of the cited span, for highlighting in the drawer. */
  highlight: z
    .object({ start: z.number().int(), end: z.number().int() })
    .nullable(),
}).openapi("ResolveClauseResponse");

export const ListPoliciesQuerySchema = PaginationQuery.extend({
  jurisdictionCode: JurisdictionCode.optional(),
  category: z.string().optional(),
  search: z.string().max(200).optional(),
}).openapi("ListPoliciesQuery");

export const CreatePolicyDocumentRequestSchema = z
  .object({
    jurisdictionCode: JurisdictionCode.nullable(),
    title: z.string().trim().min(3).max(200),
    category: z.string().trim().min(2).max(60),
    sourceUri: z.string().url().max(1000),
    version: z.string().trim().min(1).max(40),
    effectiveFrom: IsoDate,
    clauses: z.array(z.object({
      id: ClauseId,
      jurisdictionCode: JurisdictionCode.nullable(),
      heading: z.string().trim().max(200).nullable(),
      body: z.string().trim().min(30).max(20000),
      topics: z.array(z.string().trim().min(2).max(60)).max(20).default([]),
    })).min(1).max(200),
    confirmApprovedSource: z.literal(true),
  })
  .openapi("CreatePolicyDocumentRequest");
export type CreatePolicyDocumentRequest = z.infer<typeof CreatePolicyDocumentRequestSchema>;

/**
 * GET /api/v1/policies/coverage
 * Which jurisdictions we actually hold an approved corpus for. The UI uses
 * this to warn BEFORE generation that a hire's location is unsupported.
 */
export const PolicyCoverageSchema = z
  .object({
    jurisdictionCode: JurisdictionCode,
    displayName: z.string(),
    documentCount: z.number().int(),
    clauseCount: z.number().int(),
    categories: z.array(z.string()),
    /** False means jurisdiction-specific policy tasks are unavailable; a limited operational plan can still be created. */
    isSupported: z.boolean(),
  })
  .openapi("PolicyCoverage");

export const PolicyDocumentListResponseSchema = paginated(
  PolicyDocumentSchema,
  "PolicyDocumentListResponse",
);
// ADMIN — users and roles

export const RoleSchema = z
  .object({
    id: Uuid,
    key: RoleKeyEnum,
    name: z.string(),
    description: z.string().nullable(),
    isSystem: z.boolean(),
    permissions: z.array(
      z.object({ key: z.string(), scope: PermissionScopeEnum }),
    ),
  })
  .openapi("Role");

export const AdminUserSchema = z
  .object({
    id: Uuid,
    email: IdentityEmail,
    status: UserStatusEnum,
    mustChangePassword: z.boolean(),
    employeeId: Uuid.nullable(),
    employeeName: z.string().nullable(),
    roles: z.array(RoleKeyEnum),
    lastLoginAt: IsoDateTime.nullable(),
    lockedUntil: IsoDateTime.nullable(),
    createdAt: IsoDateTime,
  })
  .openapi("AdminUser");

export const CreateUserRequestSchema = z
  .object({
    email: IdentityEmail,
    roles: z.array(RoleKeyEnum).min(1),
    employeeId: Uuid.optional(),
    /** Omit to create an INVITED account with no password. */
    temporaryPassword: z.string().min(12).max(128).optional(),
  })
  .openapi("CreateUserRequest");

export const UpdateUserRequestSchema = z
  .object({
    status: UserStatusEnum.optional(),
    /** Bumps tokenVersion, invalidating every live access token at once. */
    forceLogout: z.boolean().optional(),
    unlock: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one field is required",
  })
  .openapi("UpdateUserRequest");

export const AssignRolesRequestSchema = z
  .object({
    roles: z.array(RoleKeyEnum).min(1),
    /** REPLACE overwrites the user's roles; ADD and REMOVE are incremental. */
    mode: z.enum(["REPLACE", "ADD", "REMOVE"]).default("REPLACE"),
    reason: z.string().max(500).optional(),
  })
  .openapi("AssignRolesRequest");

export const ListUsersQuerySchema = PaginationQuery.extend({
  search: z.string().max(120).optional(),
  status: UserStatusEnum.optional(),
  role: RoleKeyEnum.optional(),
}).openapi("ListUsersQuery");

export const AdminUserListResponseSchema = paginated(
  AdminUserSchema,
  "AdminUserListResponse",
);
// EVALUATION / HARNESS METRICS  (the evidence dashboard)

export const EvalMetricsSchema = z
  .object({
    runId: Uuid,
    modelName: z.string(),
    promptVersion: z.string(),
    caseCount: z.number().int(),
    /** Did every legally required task appear? V4 should make this 1.0. */
    mandatoryTaskRecall: z.number().min(0).max(1),
    /** Citations that resolve AND whose quote matches. */
    citationValidityRate: z.number().min(0).max(1),
    /** Tasks neither cited nor template-derived. The fabrication metric. */
    ungroundedTaskRate: z.number().min(0).max(1),
    /** Tasks citing an out-of-scope jurisdiction. */
    jurisdictionLeakageRate: z.number().min(0).max(1),
    /** On no-corpus profiles, did it refuse instead of inventing? */
    refusalRecall: z.number().min(0).max(1),
    /** Constrained decoding success without a repair attempt. */
    schemaFirstPassRate: z.number().min(0).max(1),
    /** Planted prompt-injection attacks blocked by V8. */
    injectionBlockRate: z.number().min(0).max(1),
    deadlineDivergenceCount: z.number().int(),
    p50LatencyMs: z.number().int(),
    p95LatencyMs: z.number().int(),
    createdAt: IsoDateTime,
  })
  .openapi("EvalMetrics");

export const HarnessStatsSchema = z
  .object({
    plansGenerated: z.number().int(),
    plansRefused: z.number().int(),
    baselineFallbacks: z.number().int(),
    tasksInsertedByValidator: z.number().int(),
    citationsRejected: z.number().int(),
    deadlinesCorrected: z.number().int(),
    approvalsBlocked: z.number().int(),
    openEscalations: z.number().int(),
  })
  .openapi("HarnessStats");
