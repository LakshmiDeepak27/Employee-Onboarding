import {
  z,
  Uuid,
  Email,
  IdentityEmail,
  IsoDate,
  IsoDateTime,
  JurisdictionCode,
  EmploymentTypeEnum,
  WorkModeEnum,
  EmployeeStatusEnum,
  PlanStatusEnum,
  PaginationQuery,
  paginated,
} from "./common.js";
// Jurisdiction (reference data)

export const JurisdictionSchema = z
  .object({
    code: JurisdictionCode,
    displayName: z.string().openapi({ example: "Ontario, Canada" }),
    countryCode: z.string().length(2).openapi({ example: "CA" }),
    businessDays: z
      .array(z.number().int().min(1).max(7))
      .openapi({
        example: [1, 2, 3, 4, 5],
        description: "ISO weekday numbers, 1 = Monday",
      }),
    timezone: z.string().openapi({ example: "America/Toronto" }),
    /** False means we hold no approved policy corpus, so plan generation
     *  will REFUSE rather than invent a plan for this location. */
    hasPolicyCorpus: z.boolean(),
  })
  .openapi("Jurisdiction");

export const DepartmentSchema = z
  .object({ id: Uuid, code: z.string(), name: z.string() })
  .openapi("Department");
// Employee

export const EmployeeSummarySchema = z
  .object({
    id: Uuid,
    employeeNumber: z.string().openapi({ example: "EMP-10042" }),
    firstName: z.string(),
    lastName: z.string(),
    jobTitle: z.string(),
    departmentName: z.string().nullable(),
    jurisdictionCode: JurisdictionCode,
    employmentType: EmploymentTypeEnum,
    startDate: IsoDate,
    status: EmployeeStatusEnum,
    /** Convenience for the HR dashboard list. */
    activePlanId: Uuid.nullable(),
    /** Most recent non-refused plan, including completed plans for history. */
    latestPlanId: Uuid.nullable(),
    latestPlanStatus: PlanStatusEnum.nullable(),
  })
  .openapi("EmployeeSummary");

export const EmployeeSchema = EmployeeSummarySchema.extend({
  userId: Uuid.nullable(),
  workEmail: IdentityEmail.nullable(),
  personalEmail: Email,
  phone: z.string().nullable(),
  departmentId: Uuid.nullable(),
  managerId: Uuid.nullable(),
  managerName: z.string().nullable(),
  roleFamily: z.string().openapi({ example: "engineering" }),
  workMode: WorkModeEnum,
  offerDate: IsoDate.nullable(),
  unionMember: z.boolean(),
  notes: z.string().nullable().openapi({
    description:
      "Free text from HR. Treated as UNTRUSTED data: it reaches the prompt inside a delimited block and is never followed as instruction.",
  }),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}).openapi("Employee");
// POST /api/v1/employees

export const CreateEmployeeRequestSchema = z
  .object({
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    personalEmail: Email,
    workEmail: IdentityEmail.optional(),
    phone: z.string().max(32).optional(),
    jobTitle: z.string().min(1).max(120),
    roleFamily: z.string().min(1).max(60).openapi({ example: "engineering" }),
    departmentId: Uuid.optional(),
    managerId: Uuid.optional(),
    jurisdictionCode: JurisdictionCode,
    employmentType: EmploymentTypeEnum,
    workMode: WorkModeEnum,
    offerDate: IsoDate.optional(),
    startDate: IsoDate,
    unionMember: z.boolean().default(false),
    notes: z.string().max(2000).optional(),
  })
  .openapi("CreateEmployeeRequest");

export const UpdateEmployeeRequestSchema = CreateEmployeeRequestSchema.partial()
  .extend({ status: EmployeeStatusEnum.optional() })
  .openapi("UpdateEmployeeRequest");
// GET /api/v1/employees

export const ListEmployeesQuerySchema = PaginationQuery.extend({
  search: z
    .string()
    .max(120)
    .optional()
    .openapi({ description: "Matches name or employee number" }),
  status: EmployeeStatusEnum.optional(),
  jurisdictionCode: JurisdictionCode.optional(),
  departmentId: Uuid.optional(),
  managerId: Uuid.optional(),
  startDateFrom: IsoDate.optional(),
  startDateTo: IsoDate.optional(),
  sort: z
    .enum(["startDate", "-startDate", "lastName", "-lastName"])
    .default("startDate"),
}).openapi("ListEmployeesQuery");

export const EmployeeListResponseSchema = paginated(
  EmployeeSummarySchema,
  "EmployeeListResponse",
);

export const ManagerOptionSchema = z
  .object({
    id: Uuid,
    firstName: z.string(),
    lastName: z.string(),
    jobTitle: z.string(),
    departmentName: z.string().nullable(),
    email: IdentityEmail,
  })
  .openapi("ManagerOption");
// POST /api/v1/employees/{id}/invite

export const InviteEmployeeRequestSchema = z
  .object({ sendEmail: z.boolean().default(true) })
  .openapi("InviteEmployeeRequest");

export const InviteEmployeeResponseSchema = z
  .object({
    userId: Uuid,
    email: Email,
    username: z.string(),
    activationEmailSent: z.boolean(),
    inviteUrl: z.string().optional(),
    expiresAt: IsoDateTime,
  })
  .openapi("InviteEmployeeResponse");

export type Employee = z.infer<typeof EmployeeSchema>;
export type CreateEmployeeRequest = z.infer<typeof CreateEmployeeRequestSchema>;
