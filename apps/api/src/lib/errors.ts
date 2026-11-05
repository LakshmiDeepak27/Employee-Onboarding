import type { z } from 'zod';

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'FORBIDDEN'
  | 'OUT_OF_SCOPE'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ACCOUNT_LOCKED'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'APPROVAL_BLOCKED'
  | 'UNSUPPORTED_JURISDICTION'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface FieldError {
  path: string;
  message: string;
  code?: string;
}

/** Every deliberate failure in the API is one of these. */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields?: FieldError[];
  readonly expose: boolean;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options?: { fields?: FieldError[]; cause?: unknown; expose?: boolean },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (options?.fields) this.fields = options.fields;
    this.expose = options?.expose ?? status < 500;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (message: string, fields?: FieldError[]) =>
  new AppError(400, 'VALIDATION_FAILED', message, fields ? { fields } : undefined);

export const unauthenticated = (message = 'Authentication required', code: ErrorCode = 'UNAUTHENTICATED') =>
  new AppError(401, code, message);

export const forbidden = (message = 'You do not have permission to do that') =>
  new AppError(403, 'FORBIDDEN', message);

/**
 * Out-of-scope rows return 404, not 403. Telling a manager "403" on another
 * team's employee confirms that employee exists, which is itself a leak.
 */
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);

export const conflict = (message: string, code: ErrorCode = 'CONFLICT', fields?: FieldError[]) =>
  new AppError(409, code, message, fields ? { fields } : undefined);

export const internal = (message = 'Something went wrong', cause?: unknown) =>
  new AppError(500, 'INTERNAL_ERROR', message, { cause, expose: false });

/** Flattens a Zod error into the API's field-error shape. */
export function zodFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
    code: issue.code,
  }));
}
