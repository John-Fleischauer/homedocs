/*
 * Attachments: which record a stored file belongs to. One nullable FK per owner
 * type, with a num_nonnulls check — see lib/db/schema.ts.
 */

import { and, asc, eq, isNull } from "drizzle-orm";
import { recordAudit } from "../core/audit";
import { inTransaction, liveIn } from "../core/internal";
import { cleanText, softDelete } from "../core/records";
import {
  assertCanEdit,
  ValidationError,
  type ActorContext,
  type Executor,
  type PropertyScope,
} from "../core/types";
import {
  attachments,
  contacts,
  fixtures,
  logs,
  projects,
  quotes,
  spaces,
  supplies,
  systems,
} from "../db/schema";
import type { Stored } from "./store";

export const OWNER_TABLES = {
  space: { table: spaces, column: "spaceId" },
  fixture: { table: fixtures, column: "fixtureId" },
  supply: { table: supplies, column: "supplyId" },
  log: { table: logs, column: "logId" },
  contact: { table: contacts, column: "contactId" },
  project: { table: projects, column: "projectId" },
  quote: { table: quotes, column: "quoteId" },
  system: { table: systems, column: "systemId" },
} as const;

export type OwnerKind = keyof typeof OWNER_TABLES;
export type Owner = { kind: OwnerKind; id: string };

export function parseOwner(raw: string | null): Owner | null {
  const [kind, id] = (raw ?? "").split(":");
  if (!kind || !id || !(kind in OWNER_TABLES)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { kind: kind as OwnerKind, id };
}

export type Attachment = typeof attachments.$inferSelect;

export async function attach(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  owner: Owner,
  file: Stored & { originalName?: string; caption?: string },
) {
  assertCanEdit(actor);
  const { table, column } = OWNER_TABLES[owner.kind];
  return inTransaction(exec, async (tx) => {
    const found = await tx
      .select({ id: table.id })
      .from(table as never)
      .where(liveIn(table, scope.propertyId, owner.id));
    if (found.length === 0)
      throw new ValidationError("That record no longer exists.");
    const [row] = await tx
      .insert(attachments)
      .values({
        propertyId: scope.propertyId,
        sha256: file.sha256,
        mime: file.mime,
        byteSize: file.byteSize,
        width: file.width,
        height: file.height,
        originalName: cleanText(file.originalName, 200),
        caption: cleanText(file.caption, 500),
        [column]: owner.id,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await recordAudit(tx, actor, {
      action: "create",
      entityType: "attachment",
      entityId: row!.id,
      after: { owner: `${owner.kind}:${owner.id}`, mime: file.mime },
    });
    return row!;
  });
}

export async function listAttachments(
  exec: Executor,
  scope: PropertyScope,
  owner: Owner,
) {
  const { column } = OWNER_TABLES[owner.kind];
  return exec
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.propertyId, scope.propertyId),
        eq(attachments[column], owner.id),
        isNull(attachments.deletedAt),
      ),
    )
    .orderBy(asc(attachments.sort), asc(attachments.createdAt));
}

export async function removeAttachment(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
) {
  return inTransaction(exec, (tx) =>
    softDelete(tx, attachments, "attachment", scope, id, actor),
  );
}

export async function setCaption(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
  caption: string,
) {
  assertCanEdit(actor);
  await exec
    .update(attachments)
    .set({
      caption: cleanText(caption, 500),
      updatedAt: new Date(),
      updatedBy: actor.userId,
    })
    .where(liveIn(attachments, scope.propertyId, id));
}

/** The live attachment for a stored file, which is what decides whether it may be served. */
export async function findBySha(exec: Executor, sha: string) {
  const [row] = await exec
    .select({
      mime: attachments.mime,
      propertyId: attachments.propertyId,
      originalName: attachments.originalName,
    })
    .from(attachments)
    .where(and(eq(attachments.sha256, sha), isNull(attachments.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** The property a record belongs to — so an upload is scoped by its record, not by a guess. */
export async function ownerProperty(
  exec: Executor,
  owner: Owner,
): Promise<string | null> {
  const { table } = OWNER_TABLES[owner.kind];
  const [row] = await exec
    .select({ propertyId: table.propertyId })
    .from(table as never)
    .where(and(eq(table.id, owner.id), isNull(table.deletedAt)));
  return (row as { propertyId: string } | undefined)?.propertyId ?? null;
}
