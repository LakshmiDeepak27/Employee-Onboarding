/**
 * OpenAPI 3.1 document, generated from the very same Zod schemas that
 * validate at runtime. The published contract therefore cannot drift from
 * the implementation, and CI fails if the committed openapi.json differs
 * from what this file produces.
 */

import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';

import { z, ErrorResponseSchema, JobAcceptedSchema, JobStateSchema, HealthSchema, ReadinessSchema, Uuid, PaginationQuery } from './common.js';
import {
  LoginRequestSchema,
  LoginResponseSchema,
  RefreshRequestSchema,
  RefreshResponseSchema,
  LogoutRequestSchema,
  MessageResponseSchema,
  ChangePasswordRequestSchema,
  AcceptInviteRequestSchema,
  MeResponseSchema,
} from './auth.js';
import {
  EmployeeSchema,
  EmployeeListResponseSchema,
  CreateEmployeeRequestSchema,
  UpdateEmployeeRequestSchema,
  ListEmployeesQuerySchema,
  InviteEmployeeRequestSchema,
  InviteEmployeeResponseSchema,
  JurisdictionSchema,
  DepartmentSchema,
} from './employees.js';
import {
  PlanSchema,
  PlanListResponseSchema,
  ListPlansQuerySchema,
  GeneratePlanRequestSchema,
  PlanGraphSchema,
  PlanRisksResponseSchema,
  UpdatePlanTaskRequestSchema,
  PlanTaskSchema,
  ApprovePlanRequestSchema,
  ApprovePlanResponseSchema,
  FindingListResponseSchema,
  AuditListResponseSchema,
  EscalationSchema,
  EscalationListResponseSchema,
  CreateEscalationRequestSchema,
  ResolveEscalationRequestSchema,
  TaskListResponseSchema,
  ListTasksQuerySchema,
} from './plans.js';
import {
  DocumentRequestSchema,
  DocumentRequestListResponseSchema,
  VerifyDocumentRequestSchema,
  EquipmentAssignmentSchema,
  EquipmentAssignmentListResponseSchema,
  CreateEquipmentAssignmentRequestSchema,
  UpdateEquipmentAssignmentRequestSchema,
  EquipmentCatalogItemSchema,
  PayrollSetupSchema,
  UpsertPayrollSetupRequestSchema,
  VerifyPayrollRequestSchema,
  BenefitEnrollmentSchema,
  BenefitEnrollmentListResponseSchema,
  ElectBenefitRequestSchema,
  BenefitPlanSchema,
  TrainingAssignmentSchema,
  TrainingAssignmentListResponseSchema,
  CreateTrainingAssignmentRequestSchema,
  CompleteTrainingRequestSchema,
  TrainingCourseSchema,
  ManagerTaskSchema,
  UpsertManagerTaskRequestSchema,
} from './services.js';
import {
  PolicyDocumentListResponseSchema,
  ListPoliciesQuerySchema,
  ResolveClauseResponseSchema,
  PolicyCoverageSchema,
  RoleSchema,
  AdminUserSchema,
  AdminUserListResponseSchema,
  CreateUserRequestSchema,
  UpdateUserRequestSchema,
  AssignRolesRequestSchema,
  ListUsersQuerySchema,
  EvalMetricsSchema,
  HarnessStatsSchema,
} from './policies.js';

export const registry = new OpenAPIRegistry();

// ---------------------------------------------------------------------------
// Security scheme
// ---------------------------------------------------------------------------

const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description:
    'Access token from POST /api/v1/auth/login. Expires in 15 minutes; use /auth/refresh to rotate. The token carries identity and roles only — permissions and scopes are resolved server-side on every request.',
});

const SECURITY = [{ [bearerAuth.name]: [] }];

// ---------------------------------------------------------------------------
// Reusable responses
// ---------------------------------------------------------------------------

function err(description: string) {
  return { description, content: { 'application/json': { schema: ErrorResponseSchema } } };
}

const RESP = {
  400: err('Validation failed. `error.fields` lists each offending path.'),
  401: err('Missing, expired or invalid access token.'),
  403: err('Authenticated, but the role lacks the permission or the row is out of scope.'),
  404: err('Resource not found, or out of the caller\'s scope (we do not leak existence).'),
  409: err('State conflict. See `error.code`.'),
  422: err('Semantically invalid.'),
  500: err('Unexpected error. Quote `error.requestId` when reporting.'),
};

function json<T extends z.ZodTypeAny>(schema: T, description: string) {
  return { description, content: { 'application/json': { schema } } };
}

const idParam = z.object({ id: Uuid });

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login',
  tags: ['Auth'],
  summary: 'Exchange credentials for an access and refresh token pair',
  description:
    'Rate limited to 10 attempts per 15 minutes per IP and per email. After 5 consecutive failures the account locks for 15 minutes and an ACCOUNT_LOCKED auth event is written.',
  request: { body: { content: { 'application/json': { schema: LoginRequestSchema } } } },
  responses: {
    200: json(LoginResponseSchema, 'Authenticated.'),
    400: RESP[400],
    401: err('Invalid credentials.'),
    423: err('Account locked. `error.code` is ACCOUNT_LOCKED.'),
    429: err('Too many attempts.'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/refresh',
  tags: ['Auth'],
  summary: 'Rotate the refresh token and issue a new access token',
  description:
    'Refresh tokens are single-use. Replaying an already-rotated token is treated as theft: the entire token family is revoked and a TOKEN_REUSE_DETECTED event is recorded.',
  request: { body: { content: { 'application/json': { schema: RefreshRequestSchema } } } },
  responses: {
    200: json(RefreshResponseSchema, 'Rotated.'),
    401: err('Refresh token invalid, expired, revoked or reused.'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/logout',
  tags: ['Auth'],
  security: SECURITY,
  summary: 'Revoke the current refresh token, or every token for the user',
  request: { body: { content: { 'application/json': { schema: LogoutRequestSchema } } } },
  responses: { 200: json(MessageResponseSchema, 'Logged out.'), 401: RESP[401] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/me',
  tags: ['Auth'],
  security: SECURITY,
  summary: 'The caller\'s identity, roles and effective permissions',
  description:
    'The frontend uses `permissions` to decide which controls to render. The server never trusts that decision and re-checks on every request.',
  responses: { 200: json(MeResponseSchema, 'Current user.'), 401: RESP[401] },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/change-password',
  tags: ['Auth'],
  security: SECURITY,
  summary: 'Change password and invalidate all existing sessions',
  request: { body: { content: { 'application/json': { schema: ChangePasswordRequestSchema } } } },
  responses: { 200: json(MessageResponseSchema, 'Changed.'), 400: RESP[400], 401: RESP[401] },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/accept-invite',
  tags: ['Auth'],
  summary: 'Activate a new hire portal account from an invite token',
  request: { body: { content: { 'application/json': { schema: AcceptInviteRequestSchema } } } },
  responses: { 200: json(LoginResponseSchema, 'Activated and signed in.'), 400: RESP[400], 404: RESP[404] },
});

// ---------------------------------------------------------------------------
// EMPLOYEES
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/v1/employees',
  tags: ['Employees'],
  security: SECURITY,
  summary: 'List employees visible to the caller',
  description:
    'Scope-filtered. `employee` sees only itself (SELF); `manager` sees only direct reports (REPORTS); `hr_admin` sees the organisation (ORG).',
  request: { query: ListEmployeesQuerySchema },
  responses: { 200: json(EmployeeListResponseSchema, 'Page of employees.'), 401: RESP[401], 403: RESP[403] },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/employees',
  tags: ['Employees'],
  security: SECURITY,
  summary: 'Create a new-hire record',
  description: 'Requires `employee.create`. Held by hr_admin only.',
  request: { body: { content: { 'application/json': { schema: CreateEmployeeRequestSchema } } } },
  responses: { 201: json(EmployeeSchema, 'Created.'), 400: RESP[400], 403: RESP[403], 409: err('employeeNumber or workEmail already exists.') },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/employees/{id}',
  tags: ['Employees'],
  security: SECURITY,
  summary: 'Fetch one employee',
  request: { params: idParam },
  responses: { 200: json(EmployeeSchema, 'Employee.'), 401: RESP[401], 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/employees/{id}',
  tags: ['Employees'],
  security: SECURITY,
  summary: 'Update an employee',
  request: { params: idParam, body: { content: { 'application/json': { schema: UpdateEmployeeRequestSchema } } } },
  responses: { 200: json(EmployeeSchema, 'Updated.'), 400: RESP[400], 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/employees/{id}/invite',
  tags: ['Employees'],
  security: SECURITY,
  summary: 'Invite a new hire to the employee portal',
  request: { params: idParam, body: { content: { 'application/json': { schema: InviteEmployeeRequestSchema } } } },
  responses: { 201: json(InviteEmployeeResponseSchema, 'Invited.'), 403: RESP[403], 404: RESP[404], 409: err('Already has an active account.') },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/jurisdictions',
  tags: ['Reference'],
  security: SECURITY,
  summary: 'Supported jurisdictions and their business-day calendars',
  description:
    '`hasPolicyCorpus: false` means plan generation will REFUSE for that location. The intake form warns before submission.',
  responses: { 200: json(z.array(JurisdictionSchema), 'Jurisdictions.'), 401: RESP[401] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/departments',
  tags: ['Reference'],
  security: SECURITY,
  summary: 'Departments',
  responses: { 200: json(z.array(DepartmentSchema), 'Departments.'), 401: RESP[401] },
});

// ---------------------------------------------------------------------------
// PLANS
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'post',
  path: '/api/v1/employees/{id}/plans',
  tags: ['Plans'],
  security: SECURITY,
  summary: 'Request AI generation of an onboarding plan',
  description:
    'Asynchronous. Returns 202 with a job id; poll GET /api/v1/jobs/{jobId} for named pipeline stages. If no approved policy corpus covers the employee jurisdiction the job completes with a REFUSED plan and an escalation, which is intended behaviour rather than an error.',
  request: { params: idParam, body: { content: { 'application/json': { schema: GeneratePlanRequestSchema } } } },
  responses: {
    202: json(JobAcceptedSchema, 'Generation queued.'),
    403: RESP[403],
    404: RESP[404],
    409: err('A draft plan already exists. Pass `regenerate: true` to replace it.'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/jobs/{id}',
  tags: ['Plans'],
  security: SECURITY,
  summary: 'Poll an async job',
  request: { params: idParam },
  responses: { 200: json(JobStateSchema, 'Job state.'), 401: RESP[401], 404: RESP[404] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/plans',
  tags: ['Plans'],
  security: SECURITY,
  summary: 'List plans visible to the caller',
  request: { query: ListPlansQuerySchema },
  responses: { 200: json(PlanListResponseSchema, 'Page of plans.'), 401: RESP[401], 403: RESP[403] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/plans/{id}',
  tags: ['Plans'],
  security: SECURITY,
  summary: 'A plan with its tasks, citations and confidence breakdown',
  request: { params: idParam },
  responses: { 200: json(PlanSchema, 'Plan.'), 401: RESP[401], 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/plans/{id}/graph',
  tags: ['Plans'],
  security: SECURITY,
  summary: 'Dependency DAG, topological order and critical path',
  description: 'Shaped to drop straight into React Flow. Guaranteed acyclic: V5 rejects cycles before persistence.',
  request: { params: idParam },
  responses: { 200: json(PlanGraphSchema, 'Graph.'), 401: RESP[401], 404: RESP[404] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/plans/{id}/risks',
  tags: ['Plans'],
  security: SECURITY,
  summary: 'Tasks that will miss day one, and why',
  request: { params: idParam },
  responses: { 200: json(PlanRisksResponseSchema, 'Risks.'), 401: RESP[401], 404: RESP[404] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/plans/{id}/findings',
  tags: ['Harness'],
  security: SECURITY,
  summary: 'What the validator chain caught',
  description:
    'Every V1-V8 decision for this plan: fabricated citations rejected, mandatory tasks inserted, deadlines corrected. This is the evidence panel.',
  request: { params: idParam, query: PaginationQuery },
  responses: { 200: json(FindingListResponseSchema, 'Findings.'), 401: RESP[401], 404: RESP[404] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/plans/{id}/audit',
  tags: ['Harness'],
  security: SECURITY,
  summary: 'Append-only audit trail for a plan',
  request: { params: idParam, query: PaginationQuery },
  responses: { 200: json(AuditListResponseSchema, 'Audit events.'), 401: RESP[401], 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/plans/{id}/approval',
  tags: ['Plans'],
  security: SECURITY,
  summary: 'Approve a plan — the only path to task dispatch',
  description:
    'Requires `plan.approve` (hr_admin only). Guardrail V7: returns 409 APPROVAL_BLOCKED while any LEGAL-class task is still NEEDS_REVIEW, so a human cannot rubber-stamp past a compliance item. The approver, timestamp and acknowledgement are written to audit_events in the same transaction.',
  request: { params: idParam, body: { content: { 'application/json': { schema: ApprovePlanRequestSchema } } } },
  responses: {
    200: json(ApprovePlanResponseSchema, 'Approved and dispatched.'),
    400: RESP[400],
    403: RESP[403],
    404: RESP[404],
    409: err('APPROVAL_BLOCKED. `error.fields` names the blocking tasks.'),
  },
});

// ---------------------------------------------------------------------------
// TASKS
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/v1/tasks',
  tags: ['Tasks'],
  security: SECURITY,
  summary: 'Cross-plan task queue for the caller',
  description: 'The work inbox. IT filters by service=EQUIPMENT, payroll by service=PAYROLL, and so on.',
  request: { query: ListTasksQuerySchema },
  responses: { 200: json(TaskListResponseSchema, 'Page of tasks.'), 401: RESP[401] },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/plans/{id}/tasks/{taskId}',
  tags: ['Tasks'],
  security: SECURITY,
  summary: 'Edit a task',
  description:
    'Re-runs V5 (graph integrity) and V6 (deadline recomputation). Overriding a computed due date requires `reason`, which is recorded in the audit trail.',
  request: {
    params: z.object({ id: Uuid, taskId: Uuid }),
    body: { content: { 'application/json': { schema: UpdatePlanTaskRequestSchema } } },
  },
  responses: { 200: json(PlanTaskSchema, 'Updated.'), 400: RESP[400], 403: RESP[403], 404: RESP[404], 409: err('Edit would create a dependency cycle.') },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/plans/{id}/tasks/{taskId}/escalations',
  tags: ['Tasks'],
  security: SECURITY,
  summary: 'Escalate a task to compliance',
  request: {
    params: z.object({ id: Uuid, taskId: Uuid }),
    body: { content: { 'application/json': { schema: CreateEscalationRequestSchema } } },
  },
  responses: { 201: json(EscalationSchema, 'Escalated.'), 400: RESP[400], 403: RESP[403], 404: RESP[404] },
});

// ---------------------------------------------------------------------------
// WORKFLOW SERVICES
// ---------------------------------------------------------------------------

const taskParam = z.object({ taskId: Uuid });

registry.registerPath({
  method: 'get',
  path: '/api/v1/tasks/{taskId}/document-request',
  tags: ['Service: Documents'],
  security: SECURITY,
  summary: 'Document request detail for a task',
  request: { params: taskParam },
  responses: { 200: json(DocumentRequestSchema, 'Document request.'), 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/tasks/{taskId}/document',
  tags: ['Service: Documents'],
  security: SECURITY,
  summary: 'Upload a document against a task',
  description: 'multipart/form-data. Max 10 MiB; application/pdf, image/jpeg or image/png only. A SHA-256 checksum is stored.',
  request: {
    params: taskParam,
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.string().openapi({ type: 'string', format: 'binary' }),
            documentType: z.string(),
          }),
        },
      },
    },
  },
  responses: { 201: json(DocumentRequestSchema, 'Uploaded.'), 400: RESP[400], 403: RESP[403], 413: err('File too large.'), 415: err('Unsupported media type.') },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/tasks/{taskId}/document/verification',
  tags: ['Service: Documents'],
  security: SECURITY,
  summary: 'Verify or reject an uploaded document',
  description: 'Requires `document.verify`. Audited.',
  request: { params: taskParam, body: { content: { 'application/json': { schema: VerifyDocumentRequestSchema } } } },
  responses: { 200: json(DocumentRequestSchema, 'Decision recorded.'), 400: RESP[400], 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/documents',
  tags: ['Service: Documents'],
  security: SECURITY,
  summary: 'List document requests in scope',
  request: { query: PaginationQuery.extend({ employeeId: Uuid.optional() }) },
  responses: { 200: json(DocumentRequestListResponseSchema, 'Page.'), 401: RESP[401] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/equipment/catalog',
  tags: ['Service: Equipment'],
  security: SECURITY,
  summary: 'Equipment catalog with lead times',
  responses: { 200: json(z.array(EquipmentCatalogItemSchema), 'Catalog.'), 401: RESP[401] },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/tasks/{taskId}/equipment',
  tags: ['Service: Equipment'],
  security: SECURITY,
  summary: 'Order equipment for a task',
  request: { params: taskParam, body: { content: { 'application/json': { schema: CreateEquipmentAssignmentRequestSchema } } } },
  responses: { 201: json(EquipmentAssignmentSchema, 'Ordered.'), 400: RESP[400], 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/tasks/{taskId}/equipment',
  tags: ['Service: Equipment'],
  security: SECURITY,
  summary: 'Update equipment status, serial or delivery date',
  request: { params: taskParam, body: { content: { 'application/json': { schema: UpdateEquipmentAssignmentRequestSchema } } } },
  responses: { 200: json(EquipmentAssignmentSchema, 'Updated.'), 400: RESP[400], 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/equipment',
  tags: ['Service: Equipment'],
  security: SECURITY,
  summary: 'IT work queue',
  request: { query: PaginationQuery.extend({ employeeId: Uuid.optional() }) },
  responses: { 200: json(EquipmentAssignmentListResponseSchema, 'Page.'), 401: RESP[401] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/tasks/{taskId}/payroll',
  tags: ['Service: Payroll'],
  security: SECURITY,
  summary: 'Payroll setup for a task',
  description: 'Requires `payroll.read`. Bank and national id values are never returned, only last four digits.',
  request: { params: taskParam },
  responses: { 200: json(PayrollSetupSchema, 'Payroll setup.'), 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/tasks/{taskId}/payroll',
  tags: ['Service: Payroll'],
  security: SECURITY,
  summary: 'Create or update payroll setup',
  description:
    'Requires `payroll.write`, held by hr_admin only - manager and employee have no payroll grant at all. `bankAccountNumber` and `nationalId` are write-only: the API stores only the last four digits plus an opaque token and discards the rest.',
  request: { params: taskParam, body: { content: { 'application/json': { schema: UpsertPayrollSetupRequestSchema } } } },
  responses: { 200: json(PayrollSetupSchema, 'Saved.'), 400: RESP[400], 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/tasks/{taskId}/payroll/verification',
  tags: ['Service: Payroll'],
  security: SECURITY,
  summary: 'Verify payroll setup before the first run',
  request: { params: taskParam, body: { content: { 'application/json': { schema: VerifyPayrollRequestSchema } } } },
  responses: { 200: json(PayrollSetupSchema, 'Verified.'), 400: RESP[400], 403: RESP[403], 409: err('Tax form or bank details still missing.') },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/benefits/plans',
  tags: ['Service: Benefits'],
  security: SECURITY,
  summary: 'Available benefit plans',
  request: { query: z.object({ jurisdictionCode: z.string().optional() }) },
  responses: { 200: json(z.array(BenefitPlanSchema), 'Benefit plans.'), 401: RESP[401] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/tasks/{taskId}/benefit-enrollment',
  tags: ['Service: Benefits'],
  security: SECURITY,
  summary: 'Benefit enrolment for a task, with the window countdown',
  request: { params: taskParam },
  responses: { 200: json(BenefitEnrollmentSchema, 'Enrolment.'), 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/tasks/{taskId}/benefit-enrollment',
  tags: ['Service: Benefits'],
  security: SECURITY,
  summary: 'Elect or waive a benefit',
  request: { params: taskParam, body: { content: { 'application/json': { schema: ElectBenefitRequestSchema } } } },
  responses: { 200: json(BenefitEnrollmentSchema, 'Recorded.'), 400: RESP[400], 403: RESP[403], 409: err('Enrolment window has closed.') },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/benefits/enrollments',
  tags: ['Service: Benefits'],
  security: SECURITY,
  summary: 'Benefits work queue',
  request: { query: PaginationQuery.extend({ employeeId: Uuid.optional() }) },
  responses: { 200: json(BenefitEnrollmentListResponseSchema, 'Page.'), 401: RESP[401] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/training/courses',
  tags: ['Service: Training'],
  security: SECURITY,
  summary: 'Course catalog',
  responses: { 200: json(z.array(TrainingCourseSchema), 'Courses.'), 401: RESP[401] },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/tasks/{taskId}/training',
  tags: ['Service: Training'],
  security: SECURITY,
  summary: 'Assign a course to a task',
  request: { params: taskParam, body: { content: { 'application/json': { schema: CreateTrainingAssignmentRequestSchema } } } },
  responses: { 201: json(TrainingAssignmentSchema, 'Assigned.'), 400: RESP[400], 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/tasks/{taskId}/training/completion',
  tags: ['Service: Training'],
  security: SECURITY,
  summary: 'Record training completion',
  request: { params: taskParam, body: { content: { 'application/json': { schema: CompleteTrainingRequestSchema } } } },
  responses: { 200: json(TrainingAssignmentSchema, 'Completed.'), 400: RESP[400], 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/training/assignments',
  tags: ['Service: Training'],
  security: SECURITY,
  summary: 'L&D work queue',
  request: { query: PaginationQuery.extend({ employeeId: Uuid.optional() }) },
  responses: { 200: json(TrainingAssignmentListResponseSchema, 'Page.'), 401: RESP[401] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/tasks/{taskId}/manager-task',
  tags: ['Service: Manager'],
  security: SECURITY,
  summary: 'Manager setup task detail',
  request: { params: taskParam },
  responses: { 200: json(ManagerTaskSchema, 'Manager task.'), 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/tasks/{taskId}/manager-task',
  tags: ['Service: Manager'],
  security: SECURITY,
  summary: 'Set buddy, day-one agenda or notes',
  description: 'Scope REPORTS: a manager may only act on their own direct reports.',
  request: { params: taskParam, body: { content: { 'application/json': { schema: UpsertManagerTaskRequestSchema } } } },
  responses: { 200: json(ManagerTaskSchema, 'Saved.'), 400: RESP[400], 403: RESP[403], 404: RESP[404] },
});

// ---------------------------------------------------------------------------
// POLICY KNOWLEDGE BASE
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/v1/policies',
  tags: ['Policies'],
  security: SECURITY,
  summary: 'Browse the approved policy corpus',
  request: { query: ListPoliciesQuerySchema },
  responses: { 200: json(PolicyDocumentListResponseSchema, 'Page of documents.'), 401: RESP[401] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/policies/coverage',
  tags: ['Policies'],
  security: SECURITY,
  summary: 'Which jurisdictions we hold an approved corpus for',
  description: '`isSupported: false` means plan generation will refuse. The intake form warns up front.',
  responses: { 200: json(z.array(PolicyCoverageSchema), 'Coverage.'), 401: RESP[401] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/clauses/{clauseId}',
  tags: ['Policies'],
  security: SECURITY,
  summary: 'Resolve a citation to its source clause',
  description:
    'Clicking a citation calls this. A 404 would mean validator V2 let a fabricated citation through, so this endpoint doubles as a live integrity check.',
  request: { params: z.object({ clauseId: z.string() }), query: z.object({ quote: z.string().optional() }) },
  responses: { 200: json(ResolveClauseResponseSchema, 'Clause with highlight offsets.'), 401: RESP[401], 404: RESP[404] },
});

// ---------------------------------------------------------------------------
// ESCALATIONS
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/v1/escalations',
  tags: ['Harness'],
  security: SECURITY,
  summary: 'Open escalations — what the system refused to decide alone',
  request: { query: PaginationQuery.extend({ status: z.string().optional() }) },
  responses: { 200: json(EscalationListResponseSchema, 'Page.'), 401: RESP[401], 403: RESP[403] },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/escalations/{id}/resolution',
  tags: ['Harness'],
  security: SECURITY,
  summary: 'Resolve or dismiss an escalation',
  request: { params: idParam, body: { content: { 'application/json': { schema: ResolveEscalationRequestSchema } } } },
  responses: { 200: json(EscalationSchema, 'Resolved.'), 400: RESP[400], 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/harness/stats',
  tags: ['Harness'],
  security: SECURITY,
  summary: 'Live harness counters for the evidence dashboard',
  responses: { 200: json(HarnessStatsSchema, 'Counters.'), 401: RESP[401] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/evals/latest',
  tags: ['Harness'],
  security: SECURITY,
  summary: 'Most recent evaluation run against the golden set',
  responses: { 200: json(EvalMetricsSchema, 'Metrics.'), 401: RESP[401], 404: err('No evaluation run yet.') },
});

// ---------------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/users',
  tags: ['Admin'],
  security: SECURITY,
  summary: 'List user accounts',
  request: { query: ListUsersQuerySchema },
  responses: { 200: json(AdminUserListResponseSchema, 'Page.'), 403: RESP[403] },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/admin/users',
  tags: ['Admin'],
  security: SECURITY,
  summary: 'Create a user account',
  request: { body: { content: { 'application/json': { schema: CreateUserRequestSchema } } } },
  responses: { 201: json(AdminUserSchema, 'Created.'), 400: RESP[400], 403: RESP[403], 409: err('Email already registered.') },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/admin/users/{id}',
  tags: ['Admin'],
  security: SECURITY,
  summary: 'Suspend, unlock or force-logout a user',
  description: '`forceLogout` bumps tokenVersion, invalidating every live access token for that user immediately.',
  request: { params: idParam, body: { content: { 'application/json': { schema: UpdateUserRequestSchema } } } },
  responses: { 200: json(AdminUserSchema, 'Updated.'), 400: RESP[400], 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/admin/users/{id}/roles',
  tags: ['Admin'],
  security: SECURITY,
  summary: 'Grant or revoke roles',
  description: 'Requires `role.assign`. Every change writes a ROLE_GRANTED or ROLE_REVOKED auth event and an audit event.',
  request: { params: idParam, body: { content: { 'application/json': { schema: AssignRolesRequestSchema } } } },
  responses: { 200: json(AdminUserSchema, 'Roles updated.'), 400: RESP[400], 403: RESP[403], 404: RESP[404] },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/roles',
  tags: ['Admin'],
  security: SECURITY,
  summary: 'Roles with their permissions and scopes',
  responses: { 200: json(z.array(RoleSchema), 'Roles.'), 403: RESP[403] },
});

// ---------------------------------------------------------------------------
// OPERATIONS
// ---------------------------------------------------------------------------

registry.registerPath({
  method: 'get',
  path: '/healthz',
  tags: ['Ops'],
  summary: 'Liveness',
  responses: { 200: json(HealthSchema, 'Alive.') },
});

registry.registerPath({
  method: 'get',
  path: '/readyz',
  tags: ['Ops'],
  summary: 'Readiness — database and LLM reported separately',
  description:
    'A `degraded` status with `llm: down` is exactly the condition that makes plan generation fall back to BASELINE_FALLBACK. Stopping Ollama and refreshing this endpoint is the demo of the degraded path.',
  responses: { 200: json(ReadinessSchema, 'Ready or degraded.'), 503: json(ReadinessSchema, 'Unavailable.') },
});

// ---------------------------------------------------------------------------
// Document builder
// ---------------------------------------------------------------------------

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Employee Onboarding Orchestrator API',
      version: '1.0.0',
      description: [
        'REST API for an AI-assisted new-hire onboarding orchestrator.',
        '',
        '## The one idea',
        '',
        'The model **proposes**, deterministic code **disposes**, and a human **authorises**.',
        'An LLM proposal is never the system output. It must survive a numbered validator',
        'chain (V1-V8) it cannot influence, against a policy corpus it cannot write to,',
        'before a named person accepts responsibility for it.',
        '',
        '## Authentication',
        '',
        'Bearer JWT. `POST /api/v1/auth/login` returns a 15-minute access token and a',
        'rotating refresh token. The access token carries identity and roles only —',
        '**permissions and scopes are resolved server-side on every request**, so a revoked',
        'grant takes effect immediately instead of at token expiry.',
        '',
        '## Authorization',
        '',
        'Every permission is `resource.action` held at a scope:',
        '',
        'There are exactly three roles, matching the system architecture diagram:',
        '',
        '| Role | Scope | What they may touch |',
        '| --- | --- | --- |',
        '| `hr_admin` | `ORG` | Everything. The only role that can approve a plan. |',
        '| `manager` | `REPORTS` | Their own direct reports only. No payroll access at all. |',
        '| `employee` | `SELF` | Their own record only. |',
        '',
        'Scope is checked against the TARGET ROW in the database, never asserted by the',
        'token. A manager holding `plan.read` at `REPORTS` genuinely cannot read another',
        'team plan, and the request returns 404 rather than 403 so the existence of the',
        'row is not leaked.',
        '',
        '## Errors',
        '',
        'Every non-2xx response is an `ErrorResponse` with a machine-readable `error.code`,',
        'a human `error.message`, an `error.requestId` to quote in bug reports, and — for',
        'validation failures — `error.fields` listing each offending path.',
        '',
        '## Conventions',
        '',
        '- Dates are `YYYY-MM-DD`; timestamps are RFC 3339 with offset.',
        '- Lists are `{ items, meta }` with `page` and `pageSize` query parameters.',
        '- Long operations return `202` with a job id; poll `GET /api/v1/jobs/{id}`.',
        '- Out-of-scope rows return `404`, not `403`, so existence is not leaked.',
        '',
        '> **Demonstration system.** The policy corpus is author-written for this challenge',
        '> and is not legal guidance. Bank numbers and national ids are never stored.',
      ].join('\n'),
      contact: { name: 'Team — AI Innovation Challenge' },
      license: { name: 'MIT' },
    },
    servers: [
      { url: 'http://localhost:4000', description: 'Local development' },
    ],
    tags: [
      { name: 'Auth', description: 'Login, token rotation, password and invites' },
      { name: 'Employees', description: 'New-hire records' },
      { name: 'Plans', description: 'AI plan generation, graph, risk and approval' },
      { name: 'Tasks', description: 'The cross-plan work queue' },
      { name: 'Service: Documents', description: 'Document collection and verification' },
      { name: 'Service: Equipment', description: 'IT asset provisioning' },
      { name: 'Service: Payroll', description: 'Payroll setup (pay-affecting)' },
      { name: 'Service: Benefits', description: 'Benefit enrolment windows' },
      { name: 'Service: Training', description: 'Mandatory and role training' },
      { name: 'Service: Manager', description: 'Team setup tasks' },
      { name: 'Policies', description: 'The approved knowledge corpus and citation resolution' },
      { name: 'Harness', description: 'Validator findings, escalations, audit and evaluation evidence' },
      { name: 'Admin', description: 'Users, roles and permissions' },
      { name: 'Reference', description: 'Jurisdictions and departments' },
      { name: 'Ops', description: 'Health, readiness and metrics' },
    ],
  });
}
