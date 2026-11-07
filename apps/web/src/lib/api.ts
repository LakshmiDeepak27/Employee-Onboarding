import type { z } from "zod";
import {
  type SignupRequest,
  type LoginResponse,
  type AuthUser,
  type Employee,
  type Plan,
  type PlanGraph,
  type PlanTask,
  type ValidationFinding,
  type ErrorResponse,
  type ChatRequest,
  type ChatResponse,
  type CreateEmployeeRequest,
  type CreatePolicyDocumentRequest,
  UpdateEmployeeRequestSchema,
  JobStateSchema,
  PlanRisksResponseSchema,
  UpdatePlanTaskRequestSchema,
  ApprovePlanRequestSchema,
  ApprovePlanResponseSchema,
  VerifyDocumentRequestSchema,
  UpdateEquipmentAssignmentRequestSchema,
  UpsertPayrollSetupRequestSchema,
  VerifyPayrollRequestSchema,
  ElectBenefitRequestSchema,
  CompleteTrainingRequestSchema,
  UpsertManagerTaskRequestSchema,
} from "@eo/contracts";

export type UpdateEmployeeRequest = z.infer<typeof UpdateEmployeeRequestSchema>;
export type JobState = z.infer<typeof JobStateSchema>;
export type PlanRisksResponse = z.infer<typeof PlanRisksResponseSchema>;
export type UpdatePlanTaskRequest = z.infer<typeof UpdatePlanTaskRequestSchema>;
export type ApprovePlanRequest = z.infer<typeof ApprovePlanRequestSchema>;
export type ApprovePlanResponse = z.infer<typeof ApprovePlanResponseSchema>;
export type VerifyDocumentRequest = z.infer<typeof VerifyDocumentRequestSchema>;
export type UpdateEquipmentAssignmentRequest = z.infer<
  typeof UpdateEquipmentAssignmentRequestSchema
>;
export type UpsertPayrollSetupRequest = z.infer<
  typeof UpsertPayrollSetupRequestSchema
>;
export type VerifyPayrollRequest = z.infer<typeof VerifyPayrollRequestSchema>;
export type ElectBenefitRequest = z.infer<typeof ElectBenefitRequestSchema>;
export type CompleteTrainingRequest = z.infer<
  typeof CompleteTrainingRequestSchema
>;
export type UpsertManagerTaskRequest = z.infer<
  typeof UpsertManagerTaskRequestSchema
>;

const BASE = "/api/v1";

let accessToken: string | null = null;

export function cleanTaskTitle(title: string) {
  return title.replace(/^DEMO\s*[—-]\s*/i, "").trim();
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}

/** Thrown for every non-2xx response, carrying the API's error envelope. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: { path: string; message: string }[];
  readonly requestId: string;
  get validationMessage() {
    return this.fields.length
      ? this.fields.map((field) => `${field.path}: ${field.message}`).join(", ")
      : this.message;
  }

  constructor(status: number, body: ErrorResponse) {
    super(body?.error?.message || "Request failed");
    this.name = "ApiError";
    this.status = status;
    this.code = body?.error?.code || "UNKNOWN_ERROR";
    this.fields = body?.error?.fields ?? [];
    this.requestId = body?.error?.requestId || "";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Internal: prevents an infinite refresh loop. */
  _retried?: boolean;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, _retried, headers, ...rest } = options;

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    credentials: "include", // sends the httpOnly refresh cookie
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new ApiError(res.status, payload as ErrorResponse);

    // One transparent refresh on an expired access token, then give up.
    if (err.code === "TOKEN_EXPIRED" && !_retried) {
      const refreshed = await tryRefresh();
      if (refreshed) return request<T>(path, { ...options, _retried: true });
    }
    if (res.status === 401 && !path.startsWith("/auth/")) {
      setAccessToken(null);
      window.dispatchEvent(new Event("session-expired"));
    }
    throw err;
  }

  return payload as T;
}

let refreshFlight: Promise<boolean> | null = null;
export function tryRefresh(): Promise<boolean> {
  if (!refreshFlight)
    refreshFlight = refreshAccess().finally(() => {
      refreshFlight = null;
    });
  return refreshFlight;
}
async function refreshAccess(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      if (res.status >= 500)
        throw new Error("Sign-in service unavailable. Please try again.");
      return false;
    }
    const data = (await res.json()) as { accessToken: string };
    setAccessToken(data.accessToken);
    return true;
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Unable to restore your session.");
  }
}
let restoration: Promise<AuthUser | null> | null = null;
export function restoreSession(): Promise<AuthUser | null> {
  if (!restoration)
    restoration = tryRefresh()
      .then((ok) => (ok ? api.auth.me() : null))
      .finally(() => {
        restoration = null;
      });
  return restoration;
}
// Endpoints

export const api = {
  auth: {
    signup: (input: SignupRequest) =>
      request<LoginResponse>("/auth/signup", { method: "POST", body: input }),
    forgotPassword: (email: string) =>
      request<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: { email },
      }),
    me: () => request<AuthUser>("/auth/me"),
    refresh: () => request<{ accessToken: string }>("/auth/refresh", { method: "POST", body: {} }),
    acceptInvite: (token: string, newPassword: string) =>
      request<LoginResponse>("/auth/accept-invite", {
        method: "POST",
        body: { token, newPassword },
      }),
    oidcStart: () => {
      window.location.assign(`${BASE}/auth/oidc/start`);
    },
    logout: (allDevices = false) =>
      request<{ message: string }>("/auth/logout", {
        method: "POST",
        body: { allDevices },
      }),
  },

  chat: {
    ask: (input: ChatRequest) =>
      request<ChatResponse>("/chat", { method: "POST", body: input }),
  },

  employees: {
    list: (params: Record<string, string | number> = {}) =>
      request<{
        items: Employee[];
        meta: { totalItems: number; totalPages: number };
      }>(
        `/employees?${new URLSearchParams(
          Object.entries(params).map(([k, v]) => [k, String(v)]),
        )}`,
      ),
    get: (id: string) => request<Employee>(`/employees/${id}`),
    create: (input: CreateEmployeeRequest) =>
      request<Employee>("/employees", { method: "POST", body: input }),
    update: (id: string, input: UpdateEmployeeRequest) =>
      request<Employee>(`/employees/${id}`, { method: "PATCH", body: input }),
    invite: (id: string) =>
      request<{
        userId: string;
        email: string;
        username: string;
        activationEmailSent: boolean;
        inviteUrl?: string;
        expiresAt: string;
      }>(`/employees/${id}/invite`, {
        method: "POST",
        body: { sendEmail: true },
      }),
    offboard: (
      id: string,
      body: { reason: string; lastWorkingDay?: string; notes?: string },
    ) => request<any>(`/employees/${id}/offboard`, { method: "POST", body }),
  },

  jobs: {
    get: (id: string) => request<JobState>(`/jobs/${id}`),
  },

  plans: {
    list: (params: Record<string, string | number> = {}) =>
      request<{
        items: any[];
        meta: { totalItems: number; totalPages: number };
      }>(
        `/plans?${new URLSearchParams(
          Object.entries(params).map(([k, v]) => [k, String(v)]),
        )}`,
      ),
    get: (id: string) => request<Plan>(`/plans/${id}`),
    graph: (id: string) => request<PlanGraph>(`/plans/${id}/graph`),
    risks: (id: string) => request<PlanRisksResponse>(`/plans/${id}/risks`),
    findings: (id: string) =>
      request<{ items: ValidationFinding[] }>(`/plans/${id}/findings`),
    audit: (id: string) => request<{ items: any[] }>(`/plans/${id}/audit`),
    generate: (
      employeeId: string,
      options: { forceBaseline?: boolean; regenerate?: boolean } = {},
    ) =>
      request<{ jobId: string; pollUrl: string }>(
        `/employees/${employeeId}/plans`,
        {
          method: "POST",
          body: {
            forceBaseline: options.forceBaseline ?? false,
            regenerate: options.regenerate ?? false,
          },
        },
      ),
    approve: (id: string, input: ApprovePlanRequest) =>
      request<ApprovePlanResponse>(`/plans/${id}/approval`, {
        method: "POST",
        body: input,
      }),
    finalize: (id: string, reason?: string) =>
      request<{ planId: string; status: string; completedAt: string; completedBy: string }>(
        `/plans/${id}/completion-approval`,
        { method: "POST", body: { acknowledgement: true, reason } },
      ),
    updateTask: (
      planId: string,
      taskId: string,
      input: UpdatePlanTaskRequest,
    ) =>
      request<PlanTask>(`/plans/${planId}/tasks/${taskId}`, {
        method: "PATCH",
        body: input,
      }),
    pack: (id: string) => request<any>(`/plans/${id}/pack`),
    packZipUrl: (id: string) => `${BASE}/plans/${id}/pack/zip`,
  },

  tasks: {
    list: async (params: Record<string, string | number> = {}) => {
      const response = await request<{
        items: PlanTask[];
        meta: { totalItems: number; totalPages: number };
      }>(
        `/tasks?${new URLSearchParams(
          Object.entries(params).map(([k, v]) => [k, String(v)]),
        )}`,
      );
      return {
        ...response,
        items: response.items.map((task) => ({
          ...task,
          title: cleanTaskTitle(task.title),
        })),
      };
    },
  },

  policies: {
    create: (body: CreatePolicyDocumentRequest) =>
      request<any>("/policies", { method: "POST", body }),
    list: (params: Record<string, string | number> = {}) =>
      request<{
        items: any[];
        meta: { totalItems: number; totalPages: number };
      }>(
        `/policies?${new URLSearchParams(
          Object.entries(params).map(([k, v]) => [k, String(v)]),
        )}`,
      ),
    getClause: (clauseId: string) =>
      request<any>(`/policies/clauses/${clauseId}`),
  },

  escalations: {
    list: () => request<{ items: any[] }>("/escalations"),
    create: (body: any) =>
      request<any>("/escalations", { method: "POST", body }),
    resolve: (id: string, body: any) =>
      request<any>(`/escalations/${id}`, { method: "PATCH", body }),
  },

  documents: {
    requests: () => request<{ items: any[] }>("/document-requests"),
    upload: (
      id: string,
      body: { fileName?: string; mimeType?: string; sizeBytes?: number },
    ) =>
      request<any>(`/document-requests/${id}/upload`, { method: "POST", body }),
    verify: (id: string, input: VerifyDocumentRequest) =>
      request<any>(`/document-requests/${id}/verify`, {
        method: "POST",
        body: input,
      }),
  },

  equipment: {
    catalog: () => request<any[]>("/equipment/catalog"),
    assignments: () => request<{ items: any[] }>("/equipment/assignments"),
    update: (id: string, input: UpdateEquipmentAssignmentRequest) =>
      request<any>(`/equipment/assignments/${id}`, {
        method: "PATCH",
        body: input,
      }),
    receipt: (id: string) =>
      request<any>(`/equipment/assignments/${id}/receipt`, {
        method: "POST",
      }),
  },

  payroll: {
    get: (taskId: string) => request<any>(`/tasks/${taskId}/payroll`),
    upsert: (taskId: string, input: UpsertPayrollSetupRequest) =>
      request<any>(`/tasks/${taskId}/payroll`, { method: "PUT", body: input }),
    verify: (taskId: string, input: VerifyPayrollRequest) =>
      request<any>(`/tasks/${taskId}/payroll/verify`, {
        method: "POST",
        body: input,
      }),
  },

  benefits: {
    plans: () => request<any[]>("/benefits/plans"),
    enrollments: () => request<{ items: any[] }>("/benefits/enrollments"),
    elect: (id: string, input: ElectBenefitRequest) =>
      request<any>(`/benefits/enrollments/${id}/elect`, {
        method: "POST",
        body: input,
      }),
  },

  training: {
    courses: () => request<any[]>("/training/courses"),
    assignments: () => request<{ items: any[] }>("/training/assignments"),
    complete: (id: string, input: CompleteTrainingRequest) =>
      request<any>(`/training/assignments/${id}/complete`, {
        method: "POST",
        body: input,
      }),
  },

  managerTasks: {
    list: () => request<{ items: any[] }>("/manager-tasks"),
    get: (taskId: string) => request<any>(`/tasks/${taskId}/manager`),
    upsert: (taskId: string, input: UpsertManagerTaskRequest) =>
      request<any>(`/tasks/${taskId}/manager`, { method: "PUT", body: input }),
  },

  reference: {
    jurisdictions: () =>
      request<
        {
          code: string;
          displayName: string;
          hasPolicyCorpus: boolean;
          timezone: string;
        }[]
      >("/jurisdictions"),
    departments: () =>
      request<{ id: string; code: string; name: string }[]>("/departments"),
    policyCoverage: () => request<any[]>("/policies/coverage"),
  },
};

export function can(user: AuthUser | null, permissionKey: string): boolean {
  return !!user?.permissions?.some((p) => p.key === permissionKey);
}
