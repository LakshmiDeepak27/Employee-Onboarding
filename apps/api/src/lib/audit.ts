import type { Request } from 'express';
import { prisma, type Prisma } from '../db/client.js';

export interface AuditInput {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/**
 * Writes one row to the append-only audit trail.
 *
 * `audit_events` has UPDATE and DELETE revoked from the application role in
 * migration 0002, so the API physically cannot rewrite history. Pass a
 * transaction client when the audit row must land atomically with the state
 * change it describes — for plan approval, that is mandatory.
 */
export async function writeAudit(
  req: Request,
  input: AuditInput,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;
  const actor = req.auth;
  await client.auditEvent.create({
    data: {
      actorUserId: actor?.userId ?? null,
      actorRole: actor?.roles.join(',') ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
      reason: input.reason ?? null,
      ipAddress: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
      requestId: req.requestId ?? null,
    },
  });
}
