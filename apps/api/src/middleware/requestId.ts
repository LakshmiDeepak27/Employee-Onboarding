import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * One id per request, echoed in the response header, in every log line and in
 * every error body. Also written to audit_events, so a row in the audit trail
 * can be traced back to the exact HTTP call that produced it.
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
}
