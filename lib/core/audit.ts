/*
 * audit_log writes. Every mutation calls this inside the same transaction as the
 * change it describes, so a change cannot commit without its audit row and a
 * rolled-back change leaves no phantom entry.
 */

import { auditLog } from "../db/schema";
import type { ActorContext, Executor } from "./types";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "purge"
  | "reveal"
  | "link"
  | "unlink";

export type AuditEntry = {
  action: AuditAction;
  entityType: string;
  entityId: string;
  /** The changed fields only, not the whole row. */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

export async function recordAudit(
  tx: Executor,
  actor: ActorContext,
  entry: AuditEntry,
) {
  await tx.insert(auditLog).values({
    actorUserId: actor.userId,
    source: actor.source,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    requestId: actor.requestId,
    clientId: actor.clientId ?? null,
  });
}

/**
 * The subset of `next` that differs from `current`, which is what before/after
 * store. Logging whole rows makes a one-field edit unreadable.
 */
export function diff<T extends Record<string, unknown>>(
  current: T,
  next: Partial<T>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue;
    const existing = current[key as keyof T];
    if (
      JSON.stringify(normalize(existing)) === JSON.stringify(normalize(value))
    )
      continue;
    before[key] = normalize(existing);
    after[key] = normalize(value);
  }
  return { before, after };
}

/* Dates round-trip through the driver as Date objects; comparing them by
   identity would report every write as a change. */
function normalize(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}
