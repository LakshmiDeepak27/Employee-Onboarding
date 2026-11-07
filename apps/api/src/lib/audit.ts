import type { Request } from "express";
import { prisma, isDatabaseOnline, setDatabaseOnline, type Prisma } from "../db/client.js";

export interface AuditInput {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

// Pass the transaction client when the audit must commit with the change.
export async function writeAudit(
  req: Request,
  input: AuditInput,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const actor = req.auth;
  const auditEntry = {
    id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    actorUserId: actor?.userId ?? null,
    actorRole: actor?.roles?.join?.(",") ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason ?? null,
    ipAddress: req.ip ?? null,
    userAgent: req.header("user-agent") ?? null,
    requestId: req.requestId ?? null,
    createdAt: new Date(),
  };

  if (isDatabaseOnline()) {
    try {
      const client = tx ?? prisma;
      await client.auditEvent.create({
        data: {
          actorUserId: auditEntry.actorUserId,
          actorRole: auditEntry.actorRole,
          action: auditEntry.action,
          resourceType: auditEntry.resourceType,
          resourceId: auditEntry.resourceId,
          before: (input.before ?? undefined) as
            Prisma.InputJsonValue | undefined,
          after: (input.after ?? undefined) as
            Prisma.InputJsonValue | undefined,
          reason: auditEntry.reason,
          ipAddress: auditEntry.ipAddress,
          userAgent: auditEntry.userAgent,
          requestId: auditEntry.requestId,
        },
      });
    } catch {
      setDatabaseOnline(false);
    }
  }
}
