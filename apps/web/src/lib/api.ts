/**
 * Typed API client.
 *
 * Every type here is imported from @eo/contracts, which is the same package
 * the API validates against. Do NOT redeclare response shapes in components:
 * if the contract changes, this file should fail to compile rather than the
 * UI failing at runtime during the demo.
 */
import type {
  LoginRequest,
  LoginResponse,
  AuthUser,
  Employee,
  Plan,
  PlanGraph,
  PlanTask,
  ValidationFinding,
  ErrorResponse,
} from '@eo/contracts';

const BASE = '/api/v1';

let accessToken: string | null = null;

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

  constructor(status: number, body: ErrorResponse) {
    super(body.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error.code;
    this.fields = body.error.fields ?? [];
    this.requestId = body.error.requestId;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Internal: prevents an infinite refresh loop. */
  _retried?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, _retried, headers, ...rest } = options;

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    credentials: 'include', // sends the httpOnly refresh cookie
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
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
    if (err.code === 'TOKEN_EXPIRED' && !_retried) {
      const refreshed = await tryRefresh();
      if (refreshed) return request<T>(path, { ...options, _retried: true });
    }
    throw err;
  }

  return payload as T;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string };
    setAccessToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const api = {
  auth: {
    login: (input: LoginRequest) =>
      request<LoginResponse>('/auth/login', { method: 'POST', body: input }),
    me: () => request<AuthUser>('/auth/me'),
    logout: (allDevices = false) =>
      request<{ message: string }>('/auth/logout', {
        method: 'POST',
        body: { allDevices },
      }),
  },

  employees: {
    list: (params: Record<string, string | number> = {}) =>
      request<{ items: Employee[]; meta: { totalItems: number; totalPages: number } }>(
        `/employees?${new URLSearchParams(
          Object.entries(params).map(([k, v]) => [k, String(v)]),
        )}`,
      ),
    get: (id: string) => request<Employee>(`/employees/${id}`),
  },

  plans: {
    get: (id: string) => request<Plan>(`/plans/${id}`),
    graph: (id: string) => request<PlanGraph>(`/plans/${id}/graph`),
    findings: (id: string) =>
      request<{ items: ValidationFinding[] }>(`/plans/${id}/findings`),
    generate: (employeeId: string) =>
      request<{ jobId: string; pollUrl: string }>(`/employees/${employeeId}/plans`, {
        method: 'POST',
        body: { forceBaseline: false, regenerate: false },
      }),
    approve: (id: string) =>
      request<{ status: string }>(`/plans/${id}/approval`, {
        method: 'POST',
        body: { decision: 'APPROVE', acknowledgement: true },
      }),
  },

  tasks: {
    list: (params: Record<string, string> = {}) =>
      request<{ items: PlanTask[] }>(`/tasks?${new URLSearchParams(params)}`),
  },

  reference: {
    jurisdictions: () =>
      request<{ code: string; displayName: string; hasPolicyCorpus: boolean }[]>(
        '/jurisdictions',
      ),
  },
};

/**
 * Permission check mirroring the server's rule, for hiding controls the user
 * cannot use. This is a UX affordance ONLY — the server re-checks every
 * request and is the actual authority.
 */
export function can(user: AuthUser | null, permissionKey: string): boolean {
  return !!user?.permissions.some((p) => p.key === permissionKey);
}
