import {
  z,
  Uuid,
  ClauseId,
  IsoDate,
  IsoDateTime,
  ServiceAreaEnum,
  OwnerRoleEnum,
  TaskTypeEnum,
  AuthorityClassEnum,
  PlanStatusEnum,
  GenerationModeEnum,
  TaskOriginEnum,
  ReviewStateEnum,
  TaskStatusEnum,
  ValidatorIdEnum,
  FindingSeverityEnum,
  FindingActionEnum,
  EscalationStatusEnum,
  PaginationQuery,
  paginated,
} from './common.js';

// ---------------------------------------------------------------------------
// Citations
//
// A citation is a FOREIGN KEY to policy_clauses, not a free string. Validator
// V2 verifies both that the clause exists and that `quotedText` really occurs
// in the clause body. A fabricated citation therefore cannot survive.
// ---------------------------------------------------------------------------

export const TaskCitationSchema = z
  .object({
    id: Uuid,
    clauseId: ClauseId,
    clauseHeading: z.string().nullable(),
    documentTitle: z.string().openapi({ example: 'Ontario Onboarding Policy' }),
    isMock: z.boolean().openapi({
      description: 'True for every corpus document in this challenge. Surfaced in the UI so no one mistakes it for legal guidance.',
    }),
    quotedText: z.string(),
    quoteMatch: z.number().min(0).max(1).openapi({
      example: 0.97,
      description: 'Similarity of the quoted span to the real clause body. Below threshold, V2 rejects the task.',
    }),
    retrievalRank: z.number().int().nullable(),
  })
  .openapi('TaskCitation');

// ---------------------------------------------------------------------------
// Plan task
// ---------------------------------------------------------------------------

export const PlanTaskSchema = z
  .object({
    id: Uuid,
    planId: Uuid,
    taskType: TaskTypeEnum,
    service: ServiceAreaEnum,
    title: z.string(),
    description: z.string().nullable(),
    ownerRole: OwnerRoleEnum,
    assigneeUserId: Uuid.nullable(),
    assigneeName: z.string().nullable(),
    dueDate: IsoDate.openapi({
      description: 'Always computed by the deterministic deadline engine (V6) from the jurisdiction business-day calendar. Never taken from the model.',
    }),
    earliestStartDate: IsoDate,
    authorityClass: AuthorityClassEnum.openapi({
      description: 'PAY_AFFECTING and LEGAL tasks cannot be dispatched without a named human approval (V7).',
    }),
    origin: TaskOriginEnum.openapi({
      description: 'Where this task came from. VALIDATOR_INSERTED means the model omitted a mandatory task and V4 added it.',
    }),
    reviewState: ReviewStateEnum,
    status: TaskStatusEnum,
    isAtRisk: z.boolean(),
    riskReason: z.string().nullable().openapi({
      example: 'Laptop lead time is 5 business days but start date is in 3.',
    }),
    onCriticalPath: z.boolean(),
    dependsOn: z.array(Uuid),
    citations: z.array(TaskCitationSchema),
    completedAt: IsoDateTime.nullable(),
    createdAt: IsoDateTime,
  })
  .openapi('PlanTask');

// ---------------------------------------------------------------------------
// Validator findings — "what the harness caught"
// ---------------------------------------------------------------------------

export const ValidationFindingSchema = z
  .object({
    id: Uuid,
    taskId: Uuid.nullable(),
    taskTitle: z.string().nullable(),
    validator: ValidatorIdEnum,
    severity: FindingSeverityEnum,
    code: z.string().openapi({
      example: 'CLAUSE_NOT_FOUND',
      description:
        'Machine-readable. One of CLAUSE_NOT_FOUND, QUOTE_MISMATCH, JURISDICTION_MISMATCH, MANDATORY_TASK_MISSING, UNKNOWN_DEPENDENCY, CYCLE_DETECTED, DEADLINE_DIVERGED, AUTHORITY_BLOCKED, TASK_TYPE_NOT_IN_VOCABULARY, SCHEMA_INVALID.',
    }),
    message: z.string(),
    detail: z.record(z.unknown()).default({}),
    action: FindingActionEnum,
    createdAt: IsoDateTime,
  })
  .openapi('ValidationFinding');

// ---------------------------------------------------------------------------
// Confidence — computed, never self-reported by the model
// ---------------------------------------------------------------------------

export const ConfidenceBreakdownSchema = z
  .object({
    citationQuoteMatch: z.number().min(0).max(1),
    retrievalScore: z.number().min(0).max(1),
    templateCorroboration: z.number().min(0).max(1),
    validatorCleanRate: z.number().min(0).max(1),
    schemaFirstPass: z.number().min(0).max(1),
  })
  .openapi('ConfidenceBreakdown');

// ---------------------------------------------------------------------------
// Onboarding plan
// ---------------------------------------------------------------------------

export const PlanSummarySchema = z
  .object({
    id: Uuid,
    employeeId: Uuid,
    employeeName: z.string(),
    jurisdictionCode: z.string(),
    startDate: IsoDate,
    status: PlanStatusEnum,
    generationMode: GenerationModeEnum,
    taskCount: z.number().int(),
    completedCount: z.number().int(),
    atRiskCount: z.number().int(),
    needsReviewCount: z.number().int(),
    confidence: z.number().min(0).max(1).nullable(),
    createdAt: IsoDateTime,
  })
  .openapi('PlanSummary');

export const PlanSchema = PlanSummarySchema.extend({
  refusalReason: z.string().nullable().openapi({
    example: 'No approved policy source covers CONTRACTOR onboarding in IN-KA.',
    description:
      'Set when the system REFUSED to generate. Refusal is intended behaviour, not an error: an ungrounded plan is worse than none.',
  }),
  confidenceBreakdown: ConfidenceBreakdownSchema.nullable(),
  modelName: z.string().nullable(),
  promptVersion: z.string().nullable(),
  approvedById: Uuid.nullable(),
  approvedByName: z.string().nullable(),
  approvedAt: IsoDateTime.nullable(),
  tasks: z.array(PlanTaskSchema),
  /** Populated only when the degraded banner should show. */
  degradedReason: z.string().nullable().openapi({
    example: 'LLM unreachable. Baseline statutory plan generated from task templates.',
  }),
  updatedAt: IsoDateTime,
}).openapi('Plan');

// ---------------------------------------------------------------------------
// POST /api/v1/employees/{employeeId}/plans   -> 202
// ---------------------------------------------------------------------------

export const GeneratePlanRequestSchema = z
  .object({
    /** Skip the model entirely and build from task_templates only.
     *  Used by tests and by the demo's degraded-mode walkthrough. */
    forceBaseline: z.boolean().default(false),
    /** Replace an existing DRAFT plan rather than failing with 409. */
    regenerate: z.boolean().default(false),
  })
  .openapi('GeneratePlanRequest');

// ---------------------------------------------------------------------------
// GET /api/v1/plans/{id}/graph
// ---------------------------------------------------------------------------

export const PlanGraphNodeSchema = z
  .object({
    id: Uuid,
    taskType: TaskTypeEnum,
    title: z.string(),
    service: ServiceAreaEnum,
    ownerRole: OwnerRoleEnum,
    status: TaskStatusEnum,
    dueDate: IsoDate,
    earliestStartDate: IsoDate,
    isAtRisk: z.boolean(),
    onCriticalPath: z.boolean(),
    /** 0-based depth in the topological order, for layered layout. */
    depth: z.number().int(),
  })
  .openapi('PlanGraphNode');

export const PlanGraphEdgeSchema = z
  .object({ from: Uuid, to: Uuid, onCriticalPath: z.boolean() })
  .openapi('PlanGraphEdge');

export const PlanGraphSchema = z
  .object({
    planId: Uuid,
    nodes: z.array(PlanGraphNodeSchema),
    edges: z.array(PlanGraphEdgeSchema),
    topologicalOrder: z.array(Uuid),
    criticalPath: z.array(Uuid),
    /** Business days from the earliest start to the latest due date. */
    criticalPathLengthDays: z.number().int(),
    isAcyclic: z.literal(true),
  })
  .openapi('PlanGraph');

// ---------------------------------------------------------------------------
// GET /api/v1/plans/{id}/risks
// ---------------------------------------------------------------------------

export const PlanRiskSchema = z
  .object({
    taskId: Uuid,
    taskTitle: z.string(),
    service: ServiceAreaEnum,
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    reasonCode: z.enum([
      'LEAD_TIME_EXCEEDS_RUNWAY',
      'DEADLINE_BEFORE_DEPENDENCY',
      'STATUTORY_DEADLINE_AT_RISK',
      'BLOCKED_BY_INCOMPLETE_DEPENDENCY',
      'ENROLMENT_WINDOW_CLOSING',
    ]),
    message: z.string(),
    dueDate: IsoDate,
    slackDays: z.number().int().openapi({
      description: 'Business days of float. Negative means already late.',
    }),
  })
  .openapi('PlanRisk');

export const PlanRisksResponseSchema = z
  .object({
    planId: Uuid,
    dayOneReady: z.boolean(),
    risks: z.array(PlanRiskSchema),
  })
  .openapi('PlanRisksResponse');

// ---------------------------------------------------------------------------
// PATCH /api/v1/plans/{planId}/tasks/{taskId}
// ---------------------------------------------------------------------------

export const UpdatePlanTaskRequestSchema = z
  .object({
    ownerRole: OwnerRoleEnum.optional(),
    assigneeUserId: Uuid.nullable().optional(),
    dueDate: IsoDate.optional(),
    status: TaskStatusEnum.optional(),
    reviewState: ReviewStateEnum.optional(),
    description: z.string().max(2000).optional(),
    /** Recorded in the audit trail. Required when overriding a computed date. */
    reason: z.string().max(500).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'at least one field is required' })
  .openapi('UpdatePlanTaskRequest');

// ---------------------------------------------------------------------------
// POST /api/v1/plans/{planId}/approval
//
// The ONLY path to dispatch. Refused (409 APPROVAL_BLOCKED) while any
// LEGAL-class task is still NEEDS_REVIEW — guardrail V7.
// ---------------------------------------------------------------------------

export const ApprovePlanRequestSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    /** Approve only these tasks. Omit to approve the whole plan. */
    taskIds: z.array(Uuid).optional(),
    reason: z.string().max(500).optional(),
    /** Must be true. Forces an explicit act of accountability. */
    acknowledgement: z.literal(true).openapi({
      description:
        'The approver confirms they have reviewed the AI-proposed tasks and accepts responsibility for them.',
    }),
  })
  .openapi('ApprovePlanRequest');

export const ApprovePlanResponseSchema = z
  .object({
    planId: Uuid,
    status: PlanStatusEnum,
    approvedTaskIds: z.array(Uuid),
    dispatchedTaskIds: z.array(Uuid),
    approvedBy: z.string(),
    approvedAt: IsoDateTime,
  })
  .openapi('ApprovePlanResponse');

/** 409 body when V7 blocks approval. */
export const ApprovalBlockedDetailSchema = z
  .object({
    blockingTasks: z.array(
      z.object({
        taskId: Uuid,
        title: z.string(),
        authorityClass: AuthorityClassEnum,
        reviewState: ReviewStateEnum,
      }),
    ),
  })
  .openapi('ApprovalBlockedDetail');

// ---------------------------------------------------------------------------
// Escalations
// ---------------------------------------------------------------------------

export const EscalationSchema = z
  .object({
    id: Uuid,
    planId: Uuid.nullable(),
    taskId: Uuid.nullable(),
    taskTitle: z.string().nullable(),
    reasonCode: z.string().openapi({ example: 'UNSUPPORTED_JURISDICTION' }),
    detail: z.string(),
    assignedRole: OwnerRoleEnum,
    status: EscalationStatusEnum,
    raisedByName: z.string().nullable(),
    resolution: z.string().nullable(),
    resolvedAt: IsoDateTime.nullable(),
    createdAt: IsoDateTime,
  })
  .openapi('Escalation');

export const CreateEscalationRequestSchema = z
  .object({
    reasonCode: z.enum([
      'UNSUPPORTED_JURISDICTION',
      'UNGROUNDED_TASK',
      'POLICY_CONFLICT',
      'DEADLINE_IMPOSSIBLE',
      'MANUAL_REVIEW_REQUESTED',
    ]),
    detail: z.string().min(1).max(2000),
    assignedRole: OwnerRoleEnum.default('COMPLIANCE'),
  })
  .openapi('CreateEscalationRequest');

export const ResolveEscalationRequestSchema = z
  .object({
    status: z.enum(['RESOLVED', 'DISMISSED']),
    resolution: z.string().min(1).max(2000),
  })
  .openapi('ResolveEscalationRequest');

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export const AuditEventSchema = z
  .object({
    id: z.string().openapi({ description: 'BigInt serialised as a string' }),
    actorName: z.string().nullable(),
    actorRole: z.string().nullable(),
    action: z.string().openapi({ example: 'plan.approved' }),
    resourceType: z.string(),
    resourceId: z.string().nullable(),
    before: z.record(z.unknown()).nullable(),
    after: z.record(z.unknown()).nullable(),
    reason: z.string().nullable(),
    requestId: z.string().nullable(),
    createdAt: IsoDateTime,
  })
  .openapi('AuditEvent');

// ---------------------------------------------------------------------------
// List queries
// ---------------------------------------------------------------------------

export const ListPlansQuerySchema = PaginationQuery.extend({
  status: PlanStatusEnum.optional(),
  employeeId: Uuid.optional(),
  atRiskOnly: z.coerce.boolean().default(false),
}).openapi('ListPlansQuery');

export const ListTasksQuerySchema = PaginationQuery.extend({
  service: ServiceAreaEnum.optional(),
  status: TaskStatusEnum.optional(),
  ownerRole: OwnerRoleEnum.optional(),
  assigneeUserId: Uuid.optional(),
  employeeId: Uuid.optional(),
  dueBefore: IsoDate.optional(),
  atRiskOnly: z.coerce.boolean().default(false),
}).openapi('ListTasksQuery');

export const PlanListResponseSchema = paginated(PlanSummarySchema, 'PlanListResponse');
export const TaskListResponseSchema = paginated(PlanTaskSchema, 'TaskListResponse');
export const FindingListResponseSchema = paginated(ValidationFindingSchema, 'FindingListResponse');
export const AuditListResponseSchema = paginated(AuditEventSchema, 'AuditListResponse');
export const EscalationListResponseSchema = paginated(EscalationSchema, 'EscalationListResponse');

export type Plan = z.infer<typeof PlanSchema>;
export type PlanTask = z.infer<typeof PlanTaskSchema>;
export type PlanGraph = z.infer<typeof PlanGraphSchema>;
export type ValidationFinding = z.infer<typeof ValidationFindingSchema>;
